import type { Board, CallFrame, CallsS, Id, Structure } from '../model/types';
import { mapStep } from './map';
import type { REnd, RObj, RTrace } from './raw';
import { replay, type SFrame } from './replay';
import { scan } from './scan';
import { shortName, textOf } from './text';
import type { End, Step, TraceResult } from './types';

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  return ka.every((k) => Object.hasOwn(rb, k) && equal(ra[k], rb[k]));
}

// The calls card changes whenever the top frame does, so reuse the previous card's equal frames. A push or pop keeps
// each frame at its index, and the 200-frame window sliding moves each one back by one, so offsets 0, +1 and -1 are tried.
// Each frame is compared once; the previous card itself is kept when every frame was reused in place.
function shareCalls(prev: CallsS, next: CallsS): CallsS {
  let same = prev.frames.length === next.frames.length && prev.id === next.id && prev.name === next.name;
  const frames = next.frames.map((f, i): CallFrame => {
    let out = f;
    // A reused CallFrame is the same object, so look for that at every offset before deep-comparing at any.
    const near = [0, 1, -1].map((d) => prev.frames[i + d]);
    const p = near.find((x) => x === f) ?? near.find((x) => x && equal(x, f));
    if (p) out = p;
    if (out !== prev.frames[i]) same = false;
    return out;
  });
  return same ? prev : { ...next, frames };
}

// Spec §5.6: every card equal to the previous step's keeps that structure object, so Card skips it; a board whose
// cards were all kept, in the same order, is the previous board object.
function share(prev: Board | undefined, next: Board): Board {
  if (!prev) return next;
  const before = Object.keys(prev.structs);
  const ids = Object.keys(next.structs);
  let same = before.length === ids.length;
  const structs: Record<Id, Structure> = {};
  ids.forEach((id, i) => {
    const p = prev.structs[id];
    const n = next.structs[id];
    const s = p?.kind === 'calls' && n.kind === 'calls' ? shareCalls(p, n) : p && equal(p, n) ? p : n;
    structs[id] = s;
    if (s !== p || before[i] !== id) same = false;
  });
  return same ? prev : { structs };
}

function endOf(end: REnd, heap: Map<number, RObj>): End {
  if (end.kind !== 'return') return end;
  return end.value === undefined ? { kind: 'return' } : { kind: 'return', value: textOf(end.value, heap) };
}

export function buildSteps(raw: RTrace, code: string): TraceResult {
  const info = scan(raw);
  const last = raw.steps.length - 1;
  const steps: Step[] = [];
  let heap = new Map<number, RObj>();
  let cut = false;
  let prev: Board | undefined;
  let frames = new WeakMap<SFrame, CallFrame>();
  let k = 0;
  for (const state of replay(raw.steps)) {
    const r = raw.steps[k];
    // A frame's CallFrame depends on its fn, its locals and the heap: a heap change drops every one, a local change that frame's.
    if (r.dh) frames = new WeakMap();
    for (const d of r.fd ?? []) {
      const f = state.stack.find((x) => x.fid === d.fid);
      if (f) frames.delete(f);
    }
    const m = mapStep(state, { raw, info, k, last: k === last, frames });
    cut ||= m.cut;
    const board = share(prev, m.board);
    const top = state.stack[state.stack.length - 1];
    const s: Step = { board, line: r.line, ev: r.ev, depth: r.depth, fn: top ? shortName(top.fn) : '' };
    if (r.ev === 'return' && r.ret !== undefined) s.detail = textOf(r.ret, state.heap);
    else if (r.ev === 'exception' && r.exc) s.detail = r.exc[1] ? `${r.exc[0]}: ${r.exc[1]}` : r.exc[0];
    steps.push(s);
    prev = board;
    heap = state.heap;
    k++;
  }
  return { steps, end: endOf(raw.end, heap), truncated: raw.truncated || cut, code };
}
