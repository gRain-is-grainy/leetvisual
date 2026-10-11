import { describe, expect, it } from 'vitest';
import { scan } from '../../../src/panel/trace/scan';
import { frame, key, R, step, trace } from '../../helpers/raw';

describe('scan', () => {
  it('finds list and tree nodes anywhere in the trace, and whether depth 2 is reached', () => {
    expect(scan(trace([key(2, [frame(1, 'Solution.f', { x: '1' })])]))).toEqual({
      ptrVars: new Map(),
      hasList: false,
      hasTree: false,
      deep: false,
    });
    const raw = trace([
      key(2, [frame(1, 'Solution.f', { x: '1' })], { 1: ['LIST'] }),
      step(3, { ev: 'call', depth: 2, push: frame(2, 'Solution.g', {}), dh: { 5: ['TNODE', '1', 'None', 'None'] } }),
    ]);
    expect(scan(raw)).toMatchObject({ hasList: false, hasTree: true, deep: true });
  });

  it('marks a name that ever held a node a pointer variable, with the kind of the first node it held', () => {
    const raw = trace([
      key(2, [frame(1, 'Solution.f', { head: R(1), n: '3' })], { 1: ['LNODE', '1', 'None'], 2: ['TNODE', '1', 'None', 'None'] }),
      step(3, { fd: [{ fid: 1, set: { curr: R(1) } }] }),
      step(4, { ev: 'call', depth: 2, push: frame(2, 'Solution.g', { node: R(2), head: R(2) }) }),
      step(5, { depth: 2, fd: [{ fid: 2, set: { node: 'None', other: R(2) } }] }),
    ]);
    expect(scan(raw).ptrVars).toEqual(
      new Map([
        ['head', 'list'],
        ['curr', 'list'],
        ['node', 'tree'],
        ['other', 'tree'],
      ]),
    );
  });

  it('names fields of self that held a node self.<field>', () => {
    const raw = trace([
      key(2, [frame(1, 'BSTIterator.__init__', { self: R(1), root: R(2) })], {
        1: ['OBJ', 'BSTIterator', [['stack', R(3)]]],
        2: ['TNODE', '7', 'None', 'None'],
        3: ['LIST'],
      }),
      step(3, { dh: { 1: ['OBJ', 'BSTIterator', [['stack', R(3)], ['cur', R(2)]]] } }),
    ]);
    expect(scan(raw).ptrVars).toEqual(
      new Map([
        ['root', 'tree'],
        ['self.cur', 'tree'],
      ]),
    );
  });

  it('ignores references with no entry and the fields of objects that are not self', () => {
    const raw = trace([
      key(2, [frame(1, 'Solution.f', { a: R(9), o: R(1) })], { 1: ['OBJ', 'Node', [['next', R(2)]]], 2: ['LNODE', '1', 'None'] }),
    ]);
    expect(scan(raw).ptrVars).toEqual(new Map());
    expect(scan(raw).hasList).toBe(true);
  });
});
