import type { Board } from '../../src/panel/model/types';
import { mapBoard } from '../../src/panel/trace/map';
import type { RFacts, RFrame, RObj, RStep, RTrace, RVal } from '../../src/panel/trace/raw';
import { replay, type State } from '../../src/panel/trace/replay';
import { scan } from '../../src/panel/trace/scan';

export const R = (id: number): ['R', number] => ['R', id];

export const frame = (fid: number, fn: string, locals: Record<string, RVal>, names: string[] = Object.keys(locals)): RFrame => ({
  fid,
  fn,
  names,
  locals,
});

// A keyframe: the whole stack (outermost first) and every object.
export const key = (line: number, stack: RFrame[], heap: Record<string, RObj> = {}, extra: Partial<RStep> = {}): RStep => ({
  k: 1,
  line,
  ev: 'line',
  depth: stack.length,
  stack,
  heap,
  ...extra,
});

// A step that carries only changes.
export const step = (line: number, extra: Partial<RStep> = {}): RStep => ({ line, ev: 'line', depth: 1, ...extra });

export const trace = (steps: RStep[], over: Partial<RTrace> = {}): RTrace => ({
  v: 1,
  keyEvery: 1000,
  facts: {},
  entry: { lists: [], trees: [], args: [] },
  steps,
  end: { kind: 'return' },
  outputs: null,
  truncated: false,
  ...over,
});

export const facts = (f: Partial<RFacts>, fn = 'Solution.f'): Record<string, RFacts> => ({
  [fn]: { cursors: [], grids: [], strs: [], ...f },
});

// A one-step trace whose only frame is `fn` with these locals over this heap.
export const one = (locals: Record<string, RVal>, heap: Record<string, RObj> = {}, over: Partial<RTrace> = {}, fn = 'Solution.f'): RTrace =>
  trace([key(2, [frame(1, fn, locals)], heap)], over);

// replay() yields one mutable State, so stop at step k to read it.
export function stateAt(raw: RTrace, k: number): State {
  let i = 0;
  for (const s of replay(raw.steps)) if (i++ === k) return s;
  throw new Error(`no step ${k}`);
}

// Step k's board (default: the last), mapped with the trace's own scan.
export function boardAt(raw: RTrace, k = raw.steps.length - 1): Board {
  return mapBoard(stateAt(raw, k), { raw, info: scan(raw), k, last: k === raw.steps.length - 1 });
}
