import { describe, expect, it } from 'vitest';
import type { ArrayS, ListS, TreeS } from '../../../src/panel/model/types';
import { mapStep } from '../../../src/panel/trace/map';
import type { RObj, RTrace } from '../../../src/panel/trace/raw';
import { scan } from '../../../src/panel/trace/scan';
import { boardAt, frame, key, R, stateAt, step, trace } from '../../helpers/raw';

// n list nodes from id `from`: from → from + 1 → … → None, valued 1, 2, …
const chain = (n: number, from = 1): Record<string, RObj> =>
  Object.fromEntries(
    Array.from({ length: n }, (_, i): [number, RObj] => [from + i, ['LNODE', String(i + 1), i === n - 1 ? 'None' : R(from + i + 1)]]),
  );
const listOf = (raw: RTrace, k?: number) => boardAt(raw, k).structs['t:#list'] as ListS;
const treeOf = (raw: RTrace, k?: number) => boardAt(raw, k).structs['t:#tree'] as TreeS;
const cutAt = (raw: RTrace) => mapStep(stateAt(raw, 0), { raw, info: scan(raw), k: 0, last: true }).cut;

describe('mapBoard: list and tree pools', () => {
  it('collects the nodes reachable from every frame into one pool named after the entry list parameters', () => {
    const raw = trace([key(5, [frame(1, 'Solution.f', { head: R(1) }), frame(2, 'Solution.g', { node: R(3) })], chain(3))], {
      entry: { lists: ['list1', 'list2'], trees: [], args: [] },
    });
    expect(listOf(raw)).toEqual({
      id: 't:#list',
      name: 'list1, list2',
      kind: 'list',
      nodes: { n1: { val: '1', next: 'n2' }, n2: { val: '2', next: 'n3' }, n3: { val: '3', next: null } },
      ptrs: [{ name: 'node', at: 'n3' }],
    });
    expect(boardAt(raw).structs['t:node']).toBeUndefined();
  });

  it('keeps nodes reachable only from the entry arguments, and names the pool ListNode by default', () => {
    const raw = trace([key(2, [frame(1, 'Solution.f', { head: R(3) })], chain(3))], { entry: { lists: [], trees: [], args: [R(1)] } });
    const pool = listOf(raw);
    expect(pool.name).toBe('ListNode');
    expect(Object.keys(pool.nodes)).toEqual(['n1', 'n2', 'n3']);
    expect(pool.ptrs).toEqual([{ name: 'head', at: 'n3' }]);
  });

  it('finds nodes through containers and object fields, and names the tree pool TreeNode by default', () => {
    const raw = trace([
      key(2, [frame(1, 'Solution.f', { stack: R(1), h: R(4) })], {
        1: ['LIST', R(2)],
        2: ['TNODE', '1', R(3), 'None'],
        3: ['TNODE', '2', 'None', 'None'],
        4: ['OBJ', 'Holder', [['root', R(5)]]],
        5: ['TNODE', '9', 'None', 'None'],
      }),
    ]);
    expect(treeOf(raw)).toEqual({
      id: 't:#tree',
      name: 'TreeNode',
      kind: 'tree',
      nodes: {
        n2: { val: '1', left: 'n3', right: null },
        n3: { val: '2', left: null, right: null },
        n5: { val: '9', left: null, right: null },
      },
      ptrs: [],
    });
    expect(boardAt(raw).structs['t:stack']).toMatchObject({ kind: 'array', items: ['TreeNode(1)'] });
    expect(boardAt(raw).structs['t:#list']).toBeUndefined();
  });

  it('has the pool on every step once the trace holds a node, empty before the node exists', () => {
    const raw = trace([
      key(2, [frame(1, 'Solution.f', { n: '1' })]),
      step(3, { fd: [{ fid: 1, set: { node: R(1) } }], dh: { 1: ['LNODE', '5', 'None'] } }),
    ]);
    expect(listOf(raw, 0)).toEqual({ id: 't:#list', name: 'ListNode', kind: 'list', nodes: {}, ptrs: [] });
    expect(listOf(raw, 1).nodes).toEqual({ n1: { val: '5', next: null } });
    expect(listOf(raw, 1).ptrs).toEqual([{ name: 'node', at: 'n1' }]);
  });

  it('shows a pointer variable that holds None as a null pointer and no card', () => {
    const raw = trace([key(2, [frame(1, 'Solution.f', { curr: R(1) })], chain(1)), step(3, { fd: [{ fid: 1, set: { curr: 'None' } }] })]);
    expect(listOf(raw).ptrs).toEqual([{ name: 'curr', at: null }]);
    expect(boardAt(raw).structs['t:curr']).toBeUndefined();
  });

  it('orders pointers by the frame variables, self fields in place, then return on the last step only', () => {
    const raw = trace(
      [key(2, [frame(1, 'Solution.f', { self: R(10), head: R(1) })], { ...chain(3), 10: ['OBJ', 'Solution', [['tail', R(3)]]] }), step(3)],
      { end: { kind: 'return', value: R(2) } },
    );
    expect(listOf(raw, 0).ptrs).toEqual([
      { name: 'self.tail', at: 'n3' },
      { name: 'head', at: 'n1' },
    ]);
    expect(listOf(raw).ptrs).toEqual([
      { name: 'self.tail', at: 'n3' },
      { name: 'head', at: 'n1' },
      { name: 'return', at: 'n2' },
    ]);
    expect(boardAt(raw).structs['t:#return']).toBeUndefined();
  });

  it('puts the returned node into the pool even when nothing else reaches it', () => {
    const raw = trace([key(2, [frame(1, 'Solution.f', { x: '1' })], chain(1, 7)), step(3)], { end: { kind: 'return', value: R(7) } });
    expect(listOf(raw, 0).nodes).toEqual({});
    expect(listOf(raw).nodes).toEqual({ n7: { val: '1', next: null } });
  });

  it('caps the list pool at 200 nodes and the tree pool at 127, and reports the cut', () => {
    const list = trace([key(2, [frame(1, 'Solution.f', { head: R(1) })], chain(205))]);
    expect(Object.keys(listOf(list).nodes)).toHaveLength(200);
    expect(listOf(list).nodes.n200).toEqual({ val: '200', next: null });
    expect(cutAt(list)).toBe(true);

    const heap: Record<string, RObj> = {};
    for (let n = 1; n <= 130; n++) heap[n] = ['TNODE', String(n), 2 * n <= 130 ? R(2 * n) : 'None', 2 * n + 1 <= 130 ? R(2 * n + 1) : 'None'];
    const tree = trace([key(2, [frame(1, 'Solution.f', { root: R(1) })], heap)]);
    expect(Object.keys(treeOf(tree).nodes)).toHaveLength(127);
    expect(treeOf(tree).nodes.n64).toEqual({ val: '64', left: null, right: null });
    expect(cutAt(tree)).toBe(true);

    expect(cutAt(trace([key(2, [frame(1, 'Solution.f', { head: R(1) })], chain(200))]))).toBe(false);
  });

  // Review Focus 3
  it('stops at cycles and keeps each node once', () => {
    const raw = trace([key(2, [frame(1, 'Solution.f', { head: R(1) })], { 1: ['LNODE', '1', R(2)], 2: ['LNODE', '2', R(1)] })]);
    expect(listOf(raw).nodes).toEqual({ n1: { val: '1', next: 'n2' }, n2: { val: '2', next: 'n1' } });
  });

  // Review Focus 2
  it('drops links to nodes with no entry and keeps a pointer variable to one at its id', () => {
    const raw = trace([
      key(2, [frame(1, 'Solution.f', { head: R(1), far: R(1) })], { 1: ['LNODE', '1', R(9)] }),
      step(3, { fd: [{ fid: 1, set: { far: R(9) } }] }),
    ]);
    expect(listOf(raw).nodes).toEqual({ n1: { val: '1', next: null } });
    expect(listOf(raw).ptrs).toEqual([
      { name: 'head', at: 'n1' },
      { name: 'far', at: 'n9' },
    ]);
  });

  // Review Focus 5
  it('gives a pointer variable that holds another value an ordinary card', () => {
    const raw = trace([
      key(2, [frame(1, 'Solution.f', { curr: R(1) })], chain(1)),
      step(3, { fd: [{ fid: 1, set: { curr: '3' } }] }),
      step(4, { fd: [{ fid: 1, set: { curr: R(2) } }], dh: { 2: ['LIST', '1'] } }),
    ]);
    expect(boardAt(raw, 1).structs['t:curr']).toMatchObject({ kind: 'var', value: '3' });
    expect(listOf(raw, 1).ptrs).toEqual([]);
    expect(boardAt(raw, 2).structs['t:curr'] as ArrayS).toMatchObject({ kind: 'array', items: ['1'] });
  });
});
