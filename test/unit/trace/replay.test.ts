import { describe, expect, it } from 'vitest';
import type { RTrace } from '../../../src/panel/trace/raw';
import { replay, type State } from '../../../src/panel/trace/replay';
import { frame, key, R, step, trace } from '../../helpers/raw';

// replay() yields the same mutable State every time, so copy it as each step goes by.
const snap = (s: State) => ({
  stack: s.stack.map((f) => [f.fid, f.fn, Object.fromEntries(f.locals)]),
  heap: Object.fromEntries(s.heap),
});
function all(raw: RTrace): ReturnType<typeof snap>[] {
  const out: ReturnType<typeof snap>[] = [];
  for (const s of replay(raw.steps)) out.push(snap(s));
  return out;
}
const fids = (raw: RTrace) => all(raw).map((s) => s.stack.map(([fid]) => fid));

const outer = frame(1, 'Solution.numIslands', { grid: R(2), count: '0' });

describe('replay', () => {
  it('takes the stack and the heap from a keyframe', () => {
    const [s] = all(trace([key(3, [outer], { 2: ['LIST', R(3)], 3: ['LIST', '"1"'] })]));
    expect(s).toEqual({
      stack: [[1, 'Solution.numIslands', { grid: ['R', 2], count: '0' }]],
      heap: { 2: ['LIST', ['R', 3]], 3: ['LIST', '"1"'] },
    });
  });

  it('pushes a frame on a call step and pops it only after the return step is shown', () => {
    const raw = trace([
      key(3, [outer], { 2: ['LIST'] }),
      step(5, { ev: 'call', depth: 2, push: frame(2, 'Solution.numIslands.<locals>.dfs', { r: '0' }) }),
      step(6, { ev: 'return', depth: 2, pop: 1, ret: 'None' }),
      step(7),
    ]);
    expect(fids(raw)).toEqual([[1], [1, 2], [1, 2], [1]]);
  });

  it('sets and deletes locals by frame id, in a suspended frame too, and ignores frames not on the stack', () => {
    const inner = frame(2, 'Solution.numIslands.<locals>.dfs', { r: '0', c: '1' });
    const raw = trace([
      key(5, [outer, inner], { 2: ['LIST'] }),
      step(9, {
        depth: 2,
        fd: [
          { fid: 1, set: { count: '1' } },
          { fid: 2, set: { r: '1' }, del: ['c'] },
          { fid: 7, set: { x: '1' } },
        ],
      }),
    ]);
    expect(all(raw)[1].stack).toEqual([
      [1, 'Solution.numIslands', { grid: ['R', 2], count: '1' }],
      [2, 'Solution.numIslands.<locals>.dfs', { r: '1' }],
    ]);
  });

  it('adds and replaces heap entries, keeps the rest, and two locals with one id see the same change', () => {
    const raw = trace([
      key(2, [frame(1, 'Solution.f', { a: R(3), b: R(3), d: R(4) })], { 3: ['LIST', '1'], 4: ['DICT'] }),
      step(3, { dh: { 3: ['LIST', '1', '2'], 5: ['SET', '9'] } }),
    ]);
    const s = all(raw)[1];
    expect(s.heap).toEqual({ 3: ['LIST', '1', '2'], 4: ['DICT'], 5: ['SET', '9'] });
    expect(s.stack[0][2]).toEqual({ a: ['R', 3], b: ['R', 3], d: ['R', 4] });
  });

  it('replaces the whole state at a later keyframe, dropping objects it no longer has', () => {
    const raw = trace([
      key(2, [frame(1, 'Solution.f', { a: R(1), b: R(2) })], { 1: ['LIST'], 2: ['LIST'] }),
      step(3, { fd: [{ fid: 1, del: ['a'] }] }),
      key(4, [frame(1, 'Solution.f', { b: R(2) })], { 2: ['LIST', '5'] }),
    ]);
    expect(all(raw)[2]).toEqual({ stack: [[1, 'Solution.f', { b: ['R', 2] }]], heap: { 2: ['LIST', '5'] } });
  });

  it('gives the same states whether a step is a keyframe or a delta', () => {
    const f = (locals: Record<string, string | ['R', number]>) => frame(1, 'Solution.f', locals, ['x', 'xs']);
    const deltas = trace([
      key(2, [f({ x: '0' })]),
      step(3, { fd: [{ fid: 1, set: { xs: R(1) } }], dh: { 1: ['LIST', '0'] } }),
      step(4, { fd: [{ fid: 1, set: { x: '1' } }], dh: { 1: ['LIST', '0', '1'] } }),
      step(5),
    ]);
    const keyed = trace([deltas.steps[0], deltas.steps[1], key(4, [f({ x: '1', xs: R(1) })], { 1: ['LIST', '0', '1'] }), step(5)]);
    expect(all(keyed)).toEqual(all(deltas));
  });

  it('pops after a return step that is a keyframe, and a keyframe right after a return keeps its own stack', () => {
    const inner = frame(2, 'Solution.numIslands.<locals>.dfs', { v: '1' });
    const raw = trace([
      key(5, [outer, inner], { 2: ['LIST'] }, { ev: 'return', pop: 1, ret: '1' }),
      step(6),
      step(8, { ev: 'call', depth: 2, push: frame(3, 'Solution.numIslands.<locals>.dfs', { v: '2' }) }),
      step(9, { ev: 'return', depth: 2, pop: 1, ret: '2' }),
      key(10, [outer], { 2: ['LIST'] }),
    ]);
    expect(fids(raw)).toEqual([[1, 2], [1], [1, 3], [1, 3], [1]]);
  });
});
