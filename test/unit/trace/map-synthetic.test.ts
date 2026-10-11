import { describe, expect, it } from 'vitest';
import type { CallsS } from '../../../src/panel/model/types';
import type { RObj, RVal } from '../../../src/panel/trace/raw';
import { boardAt, facts, frame, key, R, step, trace } from '../../helpers/raw';

const callsOf = (b: ReturnType<typeof boardAt>) => b.structs['t:#calls'] as CallsS;

describe('mapBoard: call stack card', () => {
  const raw = trace([
    key(2, [frame(1, 'Solution.numIslands', { self: R(1), grid: R(2), count: '0' })], {
      1: ['OBJ', 'Solution', []],
      2: ['LIST', R(3)],
      3: ['LIST', '"1"'],
    }),
    step(6, { ev: 'call', depth: 2, push: frame(2, 'Solution.numIslands.<locals>.dfs', { r: '0', c: '0', grid: R(2) }) }),
  ]);

  it('is on every step once the trace reaches depth 2, outermost frame first, without self', () => {
    expect(boardAt(raw, 0).structs['t:#calls']).toEqual({
      id: 't:#calls',
      name: 'calls',
      kind: 'calls',
      frames: [
        {
          fn: 'numIslands',
          locals: [
            ['grid', '[[…]]'],
            ['count', '0'],
          ],
        },
      ],
    });
    expect(callsOf(boardAt(raw, 1)).frames).toEqual([
      {
        fn: 'numIslands',
        locals: [
          ['grid', '[[…]]'],
          ['count', '0'],
        ],
      },
      {
        fn: 'dfs',
        locals: [
          ['r', '0'],
          ['c', '0'],
          ['grid', '[[…]]'],
        ],
      },
    ]);
  });

  it('is not there when the trace stays at depth 1', () => {
    expect(boardAt(trace([key(2, [frame(1, 'Solution.f', { x: '1' })])])).structs['t:#calls']).toBeUndefined();
  });

  it('cuts its values at 100 characters', () => {
    const b = boardAt(trace([key(2, [frame(1, 'Solution.f', { s: `"${'x'.repeat(150)}"` }), frame(2, 'Solution.g', {})])]));
    expect(callsOf(b).frames[0].locals[0][1]).toHaveLength(100);
  });

  it('leaves out implicit locals such as the .0 iterator of a generator expression', () => {
    const raw = trace([key(2, [frame(1, 'Solution.f', { x: '1' }), frame(2, 'Solution.f.<locals>.<genexpr>', { '.0': R(1), y: '2' })], { 1: ['LIST', '1'] })]);
    const b = boardAt(raw);
    expect(Object.keys(b.structs)).toEqual(['t:y', 't:#calls']);
    expect(callsOf(b).frames[1].locals).toEqual([['y', '2']]);
  });

  it('keeps the innermost 200 frames', () => {
    const frames = Array.from({ length: 205 }, (_, i) => frame(i + 1, `Solution.f${i + 1}`, { n: String(i) }));
    const c = callsOf(boardAt(trace([key(2, frames)])));
    expect(c.frames).toHaveLength(200);
    expect(c.frames[0].fn).toBe('f6');
    expect(c.frames[199].fn).toBe('f205');
  });
});

describe('mapBoard: return card', () => {
  const ending = (value: RVal, heap: Record<string, RObj> = {}) =>
    trace([key(2, [frame(1, 'Solution.f', { x: '1' })], heap), step(3)], { end: { kind: 'return', value }, facts: facts({ strs: ['return'] }) });

  it('is on the last step only, built by the type map from the end value', () => {
    const raw = ending(R(1), { 1: ['LIST', '0', '1'] });
    expect(boardAt(raw).structs['t:#return']).toEqual({ id: 't:#return', name: 'return', kind: 'array', items: ['0', '1'], ptrs: [] });
    expect(boardAt(raw, 0).structs['t:#return']).toBeUndefined();
    expect(boardAt(ending('3')).structs['t:#return']).toEqual({ id: 't:#return', name: 'return', kind: 'var', value: '3' });
    expect(boardAt(ending(R(1), { 1: ['DICT', ['1', '2']] })).structs['t:#return']).toMatchObject({ kind: 'map', entries: [['1', '2']] });
  });

  it('never makes a character array', () => {
    expect(boardAt(ending('"ab"')).structs['t:#return']).toEqual({ id: 't:#return', name: 'return', kind: 'var', value: '"ab"' });
  });

  it('is not there for a void end or an end that is not a return', () => {
    const base = trace([key(2, [frame(1, 'Solution.f', { x: '1' })])]);
    expect(boardAt(base).structs['t:#return']).toBeUndefined();
    expect(boardAt({ ...base, end: { kind: 'exception', type: 'ValueError', msg: '', line: 2 } }).structs['t:#return']).toBeUndefined();
  });
});

describe('mapBoard: design output card', () => {
  const raw = trace([key(2, [frame(1, 'LRUCache.__init__', { capacity: '2' })]), step(3), step(4), step(5)], {
    outputs: [
      { at: 1, v: 'None' },
      { at: 3, v: '1' },
    ],
  });

  it('fills in as each call returns', () => {
    expect(boardAt(raw, 0).structs['t:#output']).toEqual({ id: 't:#output', name: 'output', kind: 'array', items: [], ptrs: [] });
    expect(boardAt(raw, 1).structs['t:#output']).toMatchObject({ items: ['None'] });
    expect(boardAt(raw, 2).structs['t:#output']).toMatchObject({ items: ['None'] });
    expect(boardAt(raw, 3).structs['t:#output']).toMatchObject({ items: ['None', '1'] });
  });

  it('is not there without outputs', () => {
    expect(boardAt({ ...raw, outputs: null }).structs['t:#output']).toBeUndefined();
  });
});

describe('mapBoard: card order', () => {
  it('puts locals first, then the list pool, tree pool, call stack, return and output cards', () => {
    const raw = trace(
      [
        key(2, [frame(1, 'Solution.f', { x: '1' })], { 1: ['LNODE', '1', 'None'], 2: ['TNODE', '2', 'None', 'None'], 3: ['LIST', '0'] }),
        step(3, { ev: 'call', depth: 2, push: frame(2, 'Solution.g', { y: '2' }) }),
      ],
      { entry: { lists: [], trees: [], args: [R(1), R(2)] }, end: { kind: 'return', value: R(3) }, outputs: [] },
    );
    expect(Object.keys(boardAt(raw).structs)).toEqual(['t:y', 't:#list', 't:#tree', 't:#calls', 't:#return', 't:#output']);
  });
});
