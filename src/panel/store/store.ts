import type { Board, Canvas, Frame, Id, Structure } from '../model/types';
import { hash } from './hash';
import type { KV } from './kv';

export const INDEX_KEY = 'lv:index';
export const MAX_CANVASES = 100;
// Half of chrome.storage.local's 10 MB quota. A bigger canvas is refused instead of evicting the others.
export const MAX_CANVAS_BYTES = 5_000_000;

export class SaveError extends Error {}

type Refs = Record<Id, number>;
type Stored = {
  v: 1;
  pool: Structure[];
  frames: { s: Refs; line?: number }[];
  draft: Refs;
  layout: Canvas['layout'];
  view: Canvas['view'];
};

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

// The same cleanup seedBoard does, so inputs that seed the same board share one canvas.
export function canvasKey(slug: string, inputs: string[]): string {
  return `leetcode.com:${slug}:${hash(inputs.map((t) => t.replace(/\r/g, '').trim()).join('\n'))}`;
}

// Each distinct structure object is stored once; boards refer to it by pool index.
export function encodeCanvas(c: Canvas): unknown {
  const pool: Structure[] = [];
  const index = new Map<Structure, number>();
  const refs = (b: Board): Refs => {
    const out: Refs = {};
    for (const [id, s] of Object.entries(b.structs)) {
      let i = index.get(s);
      if (i === undefined) index.set(s, (i = pool.push(s) - 1));
      out[id] = i;
    }
    return out;
  };
  const stored: Stored = {
    v: 1,
    pool,
    frames: c.frames.map((f) => (f.line === undefined ? { s: refs(f.board) } : { s: refs(f.board), line: f.line })),
    draft: refs(c.draft),
    layout: c.layout,
    view: c.view,
  };
  return stored;
}

export function decodeCanvas(x: unknown): Canvas | null {
  if (!isObj(x) || x.v !== 1) return null;
  const { pool, frames, draft, layout, view } = x;
  if (!Array.isArray(pool) || !Array.isArray(frames) || frames.length === 0 || !isObj(layout) || !isObj(view)) return null;
  if (typeof view.x !== 'number' || typeof view.y !== 'number' || typeof view.zoom !== 'number') return null;
  const boards = new Map<string, Board>();
  const board = (refs: unknown): Board | null => {
    if (!isObj(refs)) return null;
    const key = JSON.stringify(refs);
    const known = boards.get(key);
    if (known) return known;
    const structs: Record<Id, Structure> = {};
    for (const [id, i] of Object.entries(refs)) {
      const s: unknown = typeof i === 'number' ? pool[i] : undefined;
      if (!isObj(s) || s.id !== id) return null;
      structs[id] = s as Structure;
    }
    const b = { structs };
    boards.set(key, b);
    return b;
  };
  const out: Frame[] = [];
  for (const f of frames) {
    const b = isObj(f) ? board(f.s) : null;
    if (!b) return null;
    out.push(isObj(f) && typeof f.line === 'number' ? { board: b, line: f.line } : { board: b });
  }
  const d = board(draft);
  if (!d) return null;
  return { v: 1, frames: out, draft: d, layout: layout as Canvas['layout'], view: view as Canvas['view'] };
}

async function readIndex(kv: KV): Promise<Record<string, number>> {
  const x = await kv.get(INDEX_KEY);
  return isObj(x) ? (x as Record<string, number>) : {};
}

async function writeIndex(kv: KV, index: Record<string, number>, drop: string[]): Promise<void> {
  for (const k of drop) delete index[k];
  if (drop.length) await kv.remove(drop);
  await kv.set(INDEX_KEY, index);
}

async function touch(kv: KV, key: string, now: number): Promise<void> {
  const index = { ...(await readIndex(kv)), [key]: now };
  const newest = Object.keys(index).sort((a, b) => Number(b === key) - Number(a === key) || index[b] - index[a]);
  await writeIndex(kv, index, newest.slice(MAX_CANVASES));
}

// Drops every stored key the index does not know (canvases whose index entry another tab
// overwrote, and caches), plus the oldest quarter (at least one) of the other canvases.
async function evict(kv: KV, keep: string): Promise<void> {
  const index = await readIndex(kv);
  const lost = (await kv.keys()).filter((k) => k !== INDEX_KEY && k !== keep && !Object.hasOwn(index, k));
  const oldest = Object.keys(index)
    .filter((k) => k !== keep)
    .sort((a, b) => index[a] - index[b]);
  await writeIndex(kv, index, [...lost, ...oldest.slice(0, Math.max(1, Math.ceil(oldest.length / 4)))]);
}

const isQuota = (e: unknown) => /quota/i.test(e instanceof Error ? e.message : String(e));

export async function loadCanvas(kv: KV, key: string, now = Date.now()): Promise<Canvas | null> {
  const c = decodeCanvas(await kv.get(key));
  if (c) await touch(kv, key, now);
  return c;
}

export async function saveCanvas(kv: KV, key: string, c: Canvas, now = Date.now()): Promise<void> {
  const value = encodeCanvas(c);
  try {
    await kv.set(key, value);
  } catch (e) {
    if (!isQuota(e)) throw e;
    if (JSON.stringify(value).length > MAX_CANVAS_BYTES) throw new SaveError('Canvas is too large to save.');
    try {
      await evict(kv, key);
      await kv.set(key, value);
    } catch (e2) {
      throw new SaveError(e2 instanceof Error ? e2.message : String(e2));
    }
  }
  await touch(kv, key, now);
}

export type Saver = { schedule(key: string, c: Canvas): void; flush(): Promise<void> };

export function createSaver(kv: KV, onError: (e: unknown) => void, delay = 500): Saver {
  let pending: { key: string; c: Canvas } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let chain: Promise<void> = Promise.resolve();
  const flush = (): Promise<void> => {
    clearTimeout(timer);
    timer = undefined;
    const p = pending;
    pending = null;
    if (p) chain = chain.then(() => saveCanvas(kv, p.key, p.c)).catch(onError);
    return chain;
  };
  return {
    schedule(key, c) {
      if (pending && pending.key !== key) void flush();
      pending = { key, c };
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), delay);
    },
    flush,
  };
}
