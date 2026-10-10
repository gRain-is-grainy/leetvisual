import { apply, type Op } from './ops';
import type { Board, Canvas, Frame, Id, Pos, View } from './types';

export const MAX_FRAMES = 500;

export type Snap = { frames: Frame[]; draft: Board };
export type Hist = { canvas: Canvas; past: Snap[]; future: Snap[] };

export function newCanvas(board: Board): Canvas {
  return { v: 1, frames: [{ board }], draft: board, layout: {}, view: { x: 0, y: 0, zoom: 1 } };
}

export function initHist(canvas: Canvas): Hist {
  return { canvas, past: [], future: [] };
}

function record(h: Hist, frames: Frame[], draft: Board): Hist {
  const { canvas } = h;
  return {
    canvas: { ...canvas, frames, draft },
    past: [...h.past, { frames: canvas.frames, draft: canvas.draft }],
    future: [],
  };
}

export function edit(h: Hist, op: Op): Hist {
  const draft = apply(h.canvas.draft, op);
  return draft === h.canvas.draft ? h : record(h, h.canvas.frames, draft);
}

export function nextStep(h: Hist, line?: number): Hist | null {
  const { frames, draft } = h.canvas;
  if (frames.length >= MAX_FRAMES) return null;
  return record(h, [...frames, line === undefined ? { board: draft } : { board: draft, line }], draft);
}

export function undo(h: Hist): Hist {
  const snap = h.past.at(-1);
  if (!snap) return h;
  const { canvas } = h;
  return {
    canvas: { ...canvas, ...snap },
    past: h.past.slice(0, -1),
    future: [...h.future, { frames: canvas.frames, draft: canvas.draft }],
  };
}

export function redo(h: Hist): Hist {
  const snap = h.future.at(-1);
  if (!snap) return h;
  const { canvas } = h;
  return {
    canvas: { ...canvas, ...snap },
    past: [...h.past, { frames: canvas.frames, draft: canvas.draft }],
    future: h.future.slice(0, -1),
  };
}

export function continueFrom(h: Hist, k: number): Hist {
  const { frames, draft } = h.canvas;
  if (!Number.isInteger(k) || k < 0 || k >= frames.length) return h;
  if (k === frames.length - 1 && draft === frames[k].board) return h;
  return record(h, frames.slice(0, k + 1), frames[k].board);
}

export function setLine(h: Hist, k: number, line: number | undefined): Hist {
  const { frames, draft } = h.canvas;
  const frame = frames[k];
  if (!frame || frame.line === line) return h;
  const next = frames.slice();
  next[k] = line === undefined ? { board: frame.board } : { board: frame.board, line };
  return record(h, next, draft);
}

export function setLayout(h: Hist, pos: Record<Id, Pos>): Hist {
  const { layout } = h.canvas;
  const changed = Object.entries(pos).some(([id, p]) => layout[id]?.x !== p.x || layout[id]?.y !== p.y);
  return changed ? { ...h, canvas: { ...h.canvas, layout: { ...layout, ...pos } } } : h;
}

export function setView(h: Hist, view: View): Hist {
  const v = h.canvas.view;
  if (v.x === view.x && v.y === view.y && v.zoom === view.zoom) return h;
  return { ...h, canvas: { ...h.canvas, view } };
}

export function structIds(c: Canvas): Set<Id> {
  const ids = new Set<Id>([...Object.keys(c.layout), ...Object.keys(c.draft.structs)]);
  for (const f of c.frames) for (const id of Object.keys(f.board.structs)) ids.add(id);
  return ids;
}
