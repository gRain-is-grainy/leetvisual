import { batch, computed, effect, signal } from '@preact/signals';
import type { ContextMsg, Theme } from '../shared/messages';
import { continueFrom, edit, initHist, newCanvas, nextStep, redo, setLayout, setLine, setView, undo, type Hist } from './model/history';
import type { Op } from './model/ops';
import type { Board, Canvas, Id, Pos, View } from './model/types';
import { seedBoard } from './parse/seed';
import type { KV } from './store/kv';
import { canvasKey, createSaver, loadCanvas, type Saver } from './store/store';

export type Session = { key: string; slug: string; hist: Hist };

export const theme = signal<Theme>('light');
export const session = signal<Session | null>(null);
export const viewing = signal<number | null>(null);
export const pendingLine = signal<number | undefined>(undefined);
export const notice = signal<string | null>(null);

export const canvas = computed<Canvas | null>(() => session.value?.hist.canvas ?? null);
export const shown = computed<Board | null>(() => {
  const c = canvas.value;
  if (!c) return null;
  const k = viewing.value;
  return k === null ? c.draft : c.frames[k].board;
});
export const prevShown = computed<Board | undefined>(() => {
  const c = canvas.value;
  if (!c) return undefined;
  const k = viewing.value;
  if (k === null) return c.frames[c.frames.length - 1].board;
  return k > 0 ? c.frames[k - 1].board : undefined;
});
export const readOnly = computed(() => viewing.value !== null);

let kv: KV;
let saver: Saver;
let loaded: Canvas | null = null;
let openSeq = 0;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
let disposers: (() => void)[] = [];

export function initState(store: KV): void {
  disposers.forEach((d) => d());
  kv = store;
  saver = createSaver(store, () => showNotice("Couldn't save this canvas."));
  disposers = [
    effect(() => {
      document.documentElement.dataset.theme = theme.value;
    }),
    effect(() => {
      const s = session.value;
      if (s && s.hist.canvas !== loaded) saver.schedule(s.key, s.hist.canvas);
    }),
  ];
}

export async function openContext(msg: ContextMsg): Promise<void> {
  theme.value = msg.theme;
  const key = canvasKey(msg.slug, msg.inputs);
  // Counted before the same-key check, so a context for the shown canvas still cancels an older open in flight.
  const seq = ++openSeq;
  if (session.value?.key === key) return;
  await saver.flush();
  const stored = await loadCanvas(kv, key);
  if (seq !== openSeq) return;
  const c = stored ?? newCanvas(seedBoard(msg.metaData, msg.inputs));
  loaded = c;
  batch(() => {
    session.value = { key, slug: msg.slug, hist: initHist(c) };
    viewing.value = null;
    pendingLine.value = undefined;
  });
}

export function setTheme(t: Theme): void {
  theme.value = t;
}

function update(h: Hist): boolean {
  const s = session.value;
  if (!s || h === s.hist) return false;
  session.value = { ...s, hist: h };
  return true;
}

export function act(op: Op): boolean {
  const s = session.value;
  if (!s || readOnly.value) return false;
  return update(edit(s.hist, op));
}

export function undoAct(): void {
  const s = session.value;
  if (!s) return;
  batch(() => {
    viewing.value = null;
    update(undo(s.hist));
  });
}

export function redoAct(): void {
  const s = session.value;
  if (!s) return;
  batch(() => {
    viewing.value = null;
    update(redo(s.hist));
  });
}

export function step(): void {
  const s = session.value;
  if (!s || readOnly.value) return;
  const h = nextStep(s.hist, pendingLine.value);
  if (!h) return showNotice('Frame limit reached (500).');
  batch(() => {
    pendingLine.value = undefined;
    update(h);
  });
}

export function view(k: number | null): void {
  const c = canvas.value;
  if (!c) return;
  viewing.value = k === null || k >= c.frames.length ? null : Math.max(0, k);
}

export function viewBy(d: 1 | -1): void {
  const c = canvas.value;
  if (!c) return;
  view((viewing.value ?? c.frames.length) + d);
}

export function continueHere(): void {
  const s = session.value;
  const k = viewing.value;
  if (!s || k === null) return;
  batch(() => {
    update(continueFrom(s.hist, k));
    viewing.value = null;
  });
}

export function setLineAt(k: number | null, line: number | undefined): void {
  const s = session.value;
  if (!s) return;
  if (k === null) pendingLine.value = line;
  else update(setLine(s.hist, k, line));
}

export function moveCard(id: Id, pos: Pos): void {
  placeCards({ [id]: pos });
}

export function placeCards(pos: Record<Id, Pos>): void {
  const s = session.value;
  if (s) update(setLayout(s.hist, pos));
}

export function setViewport(v: View): void {
  const s = session.value;
  if (s) update(setView(s.hist, v));
}

export function flushSaves(): Promise<void> {
  return saver.flush();
}

export function showNotice(text: string): void {
  notice.value = text;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice.value = null;
  }, 5000);
}
