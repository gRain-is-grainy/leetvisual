import { batch, computed, effect, signal, type ReadonlySignal } from '@preact/signals';
import type { CodeMsg, ContextMsg, ToContent } from '../shared/messages';
import type { Size } from './layout/place';
import type { Id, Pos, View } from './model/types';
import type { Runner, RunnerStatus } from './runner/runner';
import type { KV } from './store/kv';
import { largest } from './trace/largest';
import { DEFAULT_CAPS } from './trace/raw';
import type { End, TraceResult } from './trace/types';

export type Mode = 'canvas' | 'trace';
export type TraceShown = { t: 'none' } | { t: 'msg'; text: string; line?: number } | { t: 'trace'; result: TraceResult };
export type RunState = 'idle' | 'starting' | 'tracing' | 'restarting';
export type TracerDeps = { runner: Runner; send(m: ToContent): void; kv: KV; notify(text: string): void };

export const MODES_KEY = 'lv:modes';
export const MAX_MODES = 100;
export const NOT_PYTHON = 'Tracing supports Python 3. Switch the editor language to Python3.';
// Decision 18: the content script always answers within about 1 s, so silence this long means the message was lost.
const CODE_MS = 2_000;
// The page script reports an edit 300 ms after typing stops, so a report sooner than that after the code was read is
// for an edit that code already has.
const EDIT_MS = 300;
const PYTHON = new Set(['python', 'python3']); // Decision 1
const NO_EDITOR: CodeMsg = { type: 'code', error: 'no-editor' };
const FAILED = {
  timeout: 'Stopped after 5 s.',
  fatal: "Python crashed: recursion this deep (for example through @cache) overflows the browser's stack.",
  load: "Couldn't start Python.",
};

// Decision 21: card positions, the sizes reserved for them, and the viewport, per problem, never stored.
type Memory = { pos: Record<Id, Pos>; sizes: Record<Id, Size>; view: View };
const BLANK: Memory = { pos: {}, sizes: {}, view: { x: 0, y: 0, zoom: 1 } };

export const mode = signal<Mode>('canvas');
export const traced = signal<TraceShown>({ t: 'none' });
export const at = signal(0);
export const stale = signal(false);
const working = signal(false);
const status = signal<RunnerStatus>('off');
const slug = signal<string | null>(null);
const memory = signal<Record<string, Memory>>({});

export const busy: ReadonlySignal<boolean> = working;
export const runState = computed<RunState>(() => {
  const s = status.value;
  if (s === 'starting' || s === 'restarting') return s;
  return s === 'running' || working.value ? 'tracing' : 'idle';
});
const result = computed(() => {
  const t = traced.value;
  return t.t === 'trace' ? t.result : null;
});
export const traceBoard = computed(() => result.value?.steps[at.value]?.board ?? null);
export const tracePrev = computed(() => {
  const r = result.value;
  return r && at.value > 0 ? r.steps[at.value - 1].board : undefined;
});
export const sizing = computed(() => {
  const r = result.value;
  return r ? largest(r.steps) : null;
});
const mem = computed(() => (slug.value !== null && memory.value[slug.value]) || BLANK);
export const traceLayout = computed(() => mem.value.pos);
export const traceSizes = computed(() => mem.value.sizes);
export const traceView = computed(() => mem.value.view);

type Want = { line: number; err: boolean } | null;

// Spec §6.4: the line Monaco should tint, or null for none.
const want = computed<Want>(() => {
  if (mode.value !== 'trace' || stale.value) return null;
  const t = traced.value;
  if (t.t === 'msg') return t.line ? { line: t.line, err: true } : null;
  const s = t.t === 'trace' ? t.result.steps[at.value] : undefined;
  return s ? { line: s.line, err: s.ev === 'exception' } : null;
});

// Decision 22: a clear goes out at once; a move at most once per animation frame while scrubbing. The content script
// keeps the last line, clears it while the iframe is hidden and restores it when shown.
function driveHighlight(send: TracerDeps['send']): () => void {
  let sent = 'none';
  let next: Want = null;
  let frame = 0;
  const key = (w: NonNullable<Want>) => `${w.line}:${w.err}`;
  const flush = () => {
    frame = 0;
    const w = next;
    if (!w || key(w) === sent) return;
    sent = key(w);
    send(w.err ? { type: 'line', line: w.line, err: true } : { type: 'line', line: w.line });
  };
  const stop = effect(() => {
    next = want.value;
    if (next) {
      if (!frame) frame = requestAnimationFrame(flush);
      return;
    }
    cancelAnimationFrame(frame);
    frame = 0;
    if (sent !== 'none') {
      sent = 'none';
      send({ type: 'line', line: null });
    }
  });
  return () => {
    stop();
    cancelAnimationFrame(frame);
  };
}

let deps: TracerDeps | null = null;
let ctx: ContextMsg | null = null;
let slugSeq = 0;
let current: { cancelled: boolean } | null = null;
let codeWaiter: ((m: CodeMsg) => void) | null = null;
let tracedInputs: string | null = null;
let readAt = -Infinity;
let editedSinceRead = false;
let modeWrites: Promise<void> = Promise.resolve();
let disposers: (() => void)[] = [];

export function initTracer(d: TracerDeps): void {
  disposers.forEach((f) => f());
  deps = d;
  ctx = null;
  current = null;
  codeWaiter = null;
  tracedInputs = null;
  readAt = -Infinity;
  editedSinceRead = false;
  modeWrites = Promise.resolve();
  batch(() => {
    mode.value = 'canvas';
    traced.value = { t: 'none' };
    at.value = 0;
    stale.value = false;
    working.value = false;
    status.value = 'off';
    slug.value = null;
    memory.value = {};
  });
  disposers = [d.runner.onStatus((s) => (status.value = s)), driveHighlight(d.send)];
}

async function readModes(kv: KV): Promise<Record<string, number>> {
  const x = await kv.get(MODES_KEY).catch(() => undefined);
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return {};
  return Object.fromEntries(Object.entries(x).filter(([, v]) => typeof v === 'number')) as Record<string, number>;
}

// One write at a time, so quick switches can't interleave their read-modify-write. A failed write only loses the
// convenience (quota eviction may delete the key too).
function remember(s: string, m: Mode): void {
  const d = deps;
  if (!d) return;
  modeWrites = modeWrites.then(async () => {
    const modes = await readModes(d.kv);
    if (m === 'trace') modes[s] = Date.now();
    else delete modes[s];
    const keep = Object.entries(modes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_MODES);
    await d.kv.set(MODES_KEY, Object.fromEntries(keep)).catch(() => {});
  });
}

export function setMode(m: Mode): void {
  if (mode.value === m) return;
  mode.value = m;
  if (m === 'trace') deps?.runner.start();
  if (ctx) remember(ctx.slug, m);
}

export async function onContext(msg: ContextMsg): Promise<void> {
  const same = ctx?.slug === msg.slug;
  ctx = msg;
  if (same) {
    if (traced.value.t !== 'none' && JSON.stringify(msg.inputs) !== tracedInputs) stale.value = true;
    return;
  }
  const seq = ++slugSeq;
  cancel();
  tracedInputs = null;
  batch(() => {
    slug.value = msg.slug;
    traced.value = { t: 'none' };
    at.value = 0;
    stale.value = false;
  });
  const d = deps;
  if (!d) return;
  const modes = await readModes(d.kv);
  if (seq !== slugSeq) return; // another problem opened while storage was read
  mode.value = modes[msg.slug] !== undefined ? 'trace' : 'canvas';
  if (mode.value === 'trace') d.runner.start();
}

// Ends the Trace in progress, if any: it shows nothing and the previous trace stays.
function cancel(): void {
  if (!current) return;
  current.cancelled = true;
  codeWaiter?.(NO_EDITOR);
  deps?.runner.stop();
}

function readCode(d: TracerDeps): Promise<CodeMsg> {
  return new Promise((resolve) => {
    const done = (m: CodeMsg) => {
      clearTimeout(timer);
      codeWaiter = null;
      resolve(m);
    };
    const timer = setTimeout(() => done(NO_EDITOR), CODE_MS);
    codeWaiter = done;
    d.send({ type: 'getCode' });
  });
}

export function onCode(msg: CodeMsg): void {
  codeWaiter?.(msg);
}

export async function trace(): Promise<void> {
  const d = deps;
  const c = ctx;
  if (!d || !c || working.value) return;
  const me = (current = { cancelled: false });
  working.value = true;
  try {
    const code = await readCode(d);
    if (me.cancelled) return;
    if ('error' in code) return d.notify("Couldn't read your code from the editor."); // Decision 19: not an outcome
    readAt = Date.now();
    editedSinceRead = false;
    if (!PYTHON.has(code.lang)) return show({ t: 'msg', text: NOT_PYTHON }, c.inputs);
    const out = await d.runner.run({ code: code.code, slug: c.slug, meta: c.metaData, inputs: c.inputs, caps: DEFAULT_CAPS });
    if (me.cancelled) return;
    if ('fail' in out) {
      if (out.fail !== 'stopped') show({ t: 'msg', text: FAILED[out.fail] }, c.inputs);
      return;
    }
    if (out.steps.length) show({ t: 'trace', result: out }, c.inputs);
    else show({ t: 'msg', text: endText(out.end), line: out.end.kind === 'syntax' ? out.end.line : undefined }, c.inputs);
  } finally {
    // A Trace that initTracer or a newer Trace replaced must not touch their state.
    if (current === me) {
      current = null;
      working.value = false;
    }
  }
}

function show(t: TraceShown, inputs: string[]): void {
  tracedInputs = JSON.stringify(inputs);
  batch(() => {
    traced.value = t;
    at.value = 0;
    // Edited, or switched to another case, while it ran: the result is already out of date.
    stale.value = editedSinceRead || JSON.stringify(ctx?.inputs) !== tracedInputs;
  });
}

export function onCodeChanged(): void {
  if (Date.now() - readAt < EDIT_MS) return;
  editedSinceRead = true;
  if (traced.value.t !== 'none') stale.value = true;
}

export function stopTrace(): void {
  cancel();
}

export function stepTo(k: number): void {
  const r = result.value;
  if (r) at.value = Math.max(0, Math.min(r.steps.length - 1, k));
}

export function stepBy(d: 1 | -1): void {
  stepTo(at.value + d);
}

function writeMem(next: Partial<Memory>): void {
  const s = slug.value;
  if (s !== null) memory.value = { ...memory.value, [s]: { ...mem.value, ...next } };
}

export function setTraceLayout(pos: Record<Id, Pos>, sizes: Record<Id, Size> = {}): void {
  const m = mem.value;
  const moved = Object.entries(pos).some(([id, p]) => m.pos[id]?.x !== p.x || m.pos[id]?.y !== p.y);
  const resized = Object.entries(sizes).some(([id, s]) => m.sizes[id]?.w !== s.w || m.sizes[id]?.h !== s.h);
  if (!moved && !resized) return;
  writeMem({ pos: moved ? { ...m.pos, ...pos } : m.pos, sizes: resized ? { ...m.sizes, ...sizes } : m.sizes });
}

export function setTraceView(v: View): void {
  const o = mem.value.view;
  if (o.x !== v.x || o.y !== v.y || o.zoom !== v.zoom) writeMem({ view: v });
}

export function endText(e: End): string {
  switch (e.kind) {
    case 'return':
      return e.value === undefined ? 'Finished' : `Returned ${e.value}`;
    case 'exception':
      return `${e.type}${e.msg ? `: ${e.msg}` : ''}${e.line ? ` (line ${e.line})` : ''}`;
    case 'cap':
      if (e.cap === 'steps') return `Stopped after ${DEFAULT_CAPS.steps.toLocaleString('en-US')} steps`;
      if (e.cap === 'time') return `Stopped after ${DEFAULT_CAPS.ms / 1000} s`;
      return `Stopped at ${DEFAULT_CAPS.bytes / 1_000_000} MB of trace`;
    case 'syntax':
      return `SyntaxError: ${e.msg} (line ${e.line})`;
    case 'input':
      return `Couldn't read input "${e.param}".`;
    case 'unsupported':
      return "This problem's input setup isn't supported yet.";
  }
}
