import type { Board, CallFrame, CallsS, Id, Structure } from '../model/types';
import { mapStep } from './map';
import type { REnd, RObj, RTrace } from './raw';
import { replay } from './replay';
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
function shareFrames(prev: CallsS, next: CallsS): CallsS {
  const frames = next.frames.map((f, i): CallFrame => {
    for (const d of [0, 1, -1]) {
      const p = prev.frames[i + d];
      if (p && equal(p, f)) return p;
    }
    return f;
  });
  return { ...next, frames };
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
    const s = p && equal(p, n) ? p : p?.kind === 'calls' && n.kind === 'calls' ? shareFrames(p, n) : n;
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
  let k = 0;
  for (const state of replay(raw.steps)) {
    const r = raw.steps[k];
    const m = mapStep(state, { raw, info, k, last: k === last });
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
