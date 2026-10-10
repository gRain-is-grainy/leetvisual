import { describe, expect, it } from 'vitest';
import { apply, freePtrName, newNodeId, type Op } from '../../../src/panel/model/ops';
import type { ArrayS, BagS, CallsS, GridS, ListS, TreeS, VarS } from '../../../src/panel/model/types';
import { arr, bag, board, calls, grid, list, tree, v } from '../../helpers/boards';

const base = () =>
  board(
    arr('s1', ['1', '2', '3'], { ptrs: [{ name: 'i', at: 0 }] }),
    grid('s2', [['0', '1'], ['1']], { ptrs: [{ name: 'p', at: [0, 0] }] }),
    list('s3', { n1: { val: '1', next: 'n2' }, n2: { val: '2', next: 'n3' }, n3: { val: '3', next: null } }, {
      ptrs: [{ name: 'head', at: 'n1' }, { name: 'cur', at: 'n2' }],
    }),
    tree('s4', {
      n1: { val: '1', left: 'n2', right: 'n3' },
      n2: { val: '2', left: null, right: null },
      n3: { val: '3', left: 'n4', right: null },
      n4: { val: '4', left: null, right: null },
    }, { ptrs: [{ name: 'root', at: 'n1' }, { name: 'x', at: 'n3' }] }),
    calls('s5', [{ fn: 'dfs', locals: [['i', '0'], ['j', '1']] }]),
    bag('s6', 'stack', ['7', '8']),
    v('s7', '0'),
    bag('s8', 'set', ['8']),
  );

// [operation, the only structure it may replace]
const changes: [Op, string][] = [
  [{ t: 'set', at: { s: 's2', k: 'cell', r: 1, c: 0 }, val: '5' }, 's2'],
  [{ t: 'set', at: { s: 's3', k: 'node', n: 'n2' }, val: '9' }, 's3'],
  [{ t: 'set', at: { s: 's4', k: 'node', n: 'n4' }, val: '9' }, 's4'],
  [{ t: 'set', at: { s: 's5', k: 'fn', f: 0 }, val: 'bfs' }, 's5'],
  [{ t: 'set', at: { s: 's5', k: 'local', f: 0, i: 1 }, val: '2' }, 's5'],
  [{ t: 'set', at: { s: 's5', k: 'lname', f: 0, i: 1 }, val: 'k' }, 's5'],
  [{ t: 'mark', s: 's2', r: 0, c: 1 }, 's2'],
  [{ t: 'link', s: 's3', n: 'n3', side: 'next', to: 'n1' }, 's3'],
  [{ t: 'link', s: 's4', n: 'n2', side: 'left', to: 'n4' }, 's4'],
  [{ t: 'node', s: 's3', val: '4' }, 's3'],
  [{ t: 'ptr', s: 's1', name: 'i', at: 2 }, 's1'],
  [{ t: 'ptr', s: 's1', name: 'j', at: null }, 's1'],
  [{ t: 'renamePtr', s: 's1', name: 'i', to: 'lo' }, 's1'],
  [{ t: 'unptr', s: 's1', name: 'i' }, 's1'],
  [{ t: 'call', s: 's5' }, 's5'],
  [{ t: 'ret', s: 's5' }, 's5'],
  [{ t: 'local', s: 's5', f: 0, name: 'k' }, 's5'],
  [{ t: 'popTo', s: 's6', to: null }, 's6'],
  [{ t: 'rebuild', s: 's1', as: 'tree' }, 's1'],
  [{ t: 'del', at: { s: 's3', k: 'node', n: 'n2' } }, 's3'],
  [{ t: 'del', at: { s: 's5', k: 'local', f: 0, i: 0 } }, 's5'],
];

describe('apply part 2: purity', () => {
  it.each(changes)('%j copies only %s', (op, touched) => {
    const b = base();
    const before = JSON.stringify(b);
    const out = apply(b, op);
    expect(out).not.toBe(b);
    expect(JSON.stringify(b)).toBe(before);
    for (const id of Object.keys(b.structs)) {
      if (id !== touched) expect(out.structs[id]).toBe(b.structs[id]);
    }
  });

  it('popTo changes the stack and the target only', () => {
    const b = base();
    const out = apply(b, { t: 'popTo', s: 's6', to: { s: 's7', k: 'var' } });
    expect((out.structs.s6 as BagS).items).toEqual(['7']);
    expect((out.structs.s7 as VarS).value).toBe('8');
    expect(out.structs.s1).toBe(b.structs.s1);
  });
});

const noops: [string, Op][] = [
  ['marking outside a ragged row', { t: 'mark', s: 's2', r: 1, c: 1 }],
  ['setting a cell outside a ragged row', { t: 'set', at: { s: 's2', k: 'cell', r: 1, c: 1 }, val: '5' }],
  ['setting a missing node', { t: 'set', at: { s: 's3', k: 'node', n: 'n9' }, val: '5' }],
  ['linking to a missing node', { t: 'link', s: 's3', n: 'n1', side: 'next', to: 'n9' }],
  ['linking a list node by left', { t: 'link', s: 's3', n: 'n1', side: 'left', to: 'n2' }],
  ['linking a tree node by next', { t: 'link', s: 's4', n: 'n1', side: 'next', to: 'n2' }],
  ['relinking to the same node', { t: 'link', s: 's3', n: 'n1', side: 'next', to: 'n2' }],
  ['moving a pointer out of range', { t: 'ptr', s: 's1', name: 'i', at: 3 }],
  ['moving a grid pointer outside a ragged row', { t: 'ptr', s: 's2', name: 'p', at: [1, 1] }],
  ['moving a list pointer to a missing node', { t: 'ptr', s: 's3', name: 'cur', at: 'n9' }],
  ['moving a pointer to where it is', { t: 'ptr', s: 's2', name: 'p', at: [0, 0] }],
  ['adding a pointer with a blank name', { t: 'ptr', s: 's1', name: ' ', at: 0 }],
  ['adding a pointer to a var', { t: 'ptr', s: 's7', name: 'i', at: null }],
  ['renaming a pointer to a used name', { t: 'renamePtr', s: 's3', name: 'cur', to: 'head' }],
  ['renaming a missing pointer', { t: 'renamePtr', s: 's1', name: 'z', to: 'y' }],
  ['removing a missing pointer', { t: 'unptr', s: 's1', name: 'z' }],
  ['renaming a local to a used name', { t: 'set', at: { s: 's5', k: 'lname', f: 0, i: 1 }, val: 'i' }],
  ['renaming a function to blank', { t: 'set', at: { s: 's5', k: 'fn', f: 0 }, val: '  ' }],
  ['adding a duplicate local', { t: 'local', s: 's5', f: 0, name: 'j' }],
  ['adding a local to a missing frame', { t: 'local', s: 's5', f: 3, name: 'z' }],
  ['popping a frame from a missing card', { t: 'ret', s: 's9' }],
  ['popTo on a var', { t: 'popTo', s: 's7', to: null }],
  ['rebuilding a non-array', { t: 'rebuild', s: 's7', as: 'list' }],
  ['deleting a missing node', { t: 'del', at: { s: 's4', k: 'node', n: 'n9' } }],
];

describe('apply part 2: no-ops return the same board', () => {
  it.each(noops)('%s', (_, op) => {
    const b = base();
    expect(apply(b, op)).toBe(b);
  });

  it('ret and popTo on empty structures', () => {
    const b = board(calls('s1', []), bag('s2', 'stack', []));
    expect(apply(b, { t: 'ret', s: 's1' })).toBe(b);
    expect(apply(b, { t: 'popTo', s: 's2', to: null })).toBe(b);
  });
});

describe('lists', () => {
  it('rewires the tail into a cycle and keeps the other nodes shared', () => {
    const b = base();
    const s = apply(b, { t: 'link', s: 's3', n: 'n3', side: 'next', to: 'n1' }).structs.s3 as ListS;
    expect(s.nodes.n3.next).toBe('n1');
    expect(s.nodes.n1).toBe((b.structs.s3 as ListS).nodes.n1);
  });

  it('a node can point at itself', () => {
    const s = apply(base(), { t: 'link', s: 's3', n: 'n2', side: 'next', to: 'n2' }).structs.s3 as ListS;
    expect(s.nodes.n2.next).toBe('n2');
  });

  it('adds a detached node with the next id', () => {
    const b = base();
    expect(newNodeId(b.structs.s3 as ListS)).toBe('n4');
    const s = apply(b, { t: 'node', s: 's3', val: '4' }).structs.s3 as ListS;
    expect(s.nodes.n4).toEqual({ val: '4', next: null });
  });

  it('deleting a node nulls the links and pointers that referenced it', () => {
    const s = apply(base(), { t: 'del', at: { s: 's3', k: 'node', n: 'n2' } }).structs.s3 as ListS;
    expect(Object.keys(s.nodes)).toEqual(['n1', 'n3']);
    expect(s.nodes.n1.next).toBeNull();
    expect(s.ptrs).toEqual([{ name: 'head', at: 'n1' }, { name: 'cur', at: null }]);
  });
});

describe('trees', () => {
  it('detaching a subtree keeps its nodes in the pool', () => {
    const s = apply(base(), { t: 'link', s: 's4', n: 'n1', side: 'right', to: null }).structs.s4 as TreeS;
    expect(s.nodes.n1.right).toBeNull();
    expect(s.nodes.n3).toEqual({ val: '3', left: 'n4', right: null });
  });

  it('deleting a node detaches its children and nulls pointers at it', () => {
    const s = apply(base(), { t: 'del', at: { s: 's4', k: 'node', n: 'n3' } }).structs.s4 as TreeS;
    expect(s.nodes.n1.right).toBeNull();
    expect(s.nodes.n4).toEqual({ val: '4', left: null, right: null });
    expect(s.ptrs).toEqual([{ name: 'root', at: 'n1' }, { name: 'x', at: null }]);
  });

  it('adds a detached tree node', () => {
    const s = apply(base(), { t: 'node', s: 's4', val: '5' }).structs.s4 as TreeS;
    expect(s.nodes.n5).toEqual({ val: '5', left: null, right: null });
  });
});

describe('grids', () => {
  it('toggles a mark on and off', () => {
    const b1 = apply(base(), { t: 'mark', s: 's2', r: 1, c: 0 });
    expect((b1.structs.s2 as GridS).marked).toEqual(['1,0']);
    expect((apply(b1, { t: 'mark', s: 's2', r: 1, c: 0 }).structs.s2 as GridS).marked).toEqual([]);
  });

  it('edits a cell and keeps other rows shared', () => {
    const b = base();
    const s = apply(b, { t: 'set', at: { s: 's2', k: 'cell', r: 1, c: 0 }, val: '5' }).structs.s2 as GridS;
    expect(s.rows).toEqual([['0', '1'], ['5']]);
    expect(s.rows[0]).toBe((b.structs.s2 as GridS).rows[0]);
  });

  it('accepts an [r, c] pointer inside a row', () => {
    const s = apply(base(), { t: 'ptr', s: 's2', name: 'q', at: [1, 0] }).structs.s2 as GridS;
    expect(s.ptrs).toEqual([{ name: 'p', at: [0, 0] }, { name: 'q', at: [1, 0] }]);
  });
});

describe('pointers', () => {
  it('adds, moves, renames and removes', () => {
    let b = apply(base(), { t: 'ptr', s: 's1', name: ' j ', at: 1 });
    expect((b.structs.s1 as ArrayS).ptrs).toEqual([{ name: 'i', at: 0 }, { name: 'j', at: 1 }]);
    b = apply(b, { t: 'ptr', s: 's1', name: 'i', at: null });
    b = apply(b, { t: 'renamePtr', s: 's1', name: 'j', to: 'hi' });
    expect((b.structs.s1 as ArrayS).ptrs).toEqual([{ name: 'i', at: null }, { name: 'hi', at: 1 }]);
    b = apply(b, { t: 'unptr', s: 's1', name: 'i' });
    expect((b.structs.s1 as ArrayS).ptrs).toEqual([{ name: 'hi', at: 1 }]);
  });

  it('suggests free names', () => {
    expect(freePtrName([])).toBe('i');
    expect(freePtrName([{ name: 'i', at: 0 }, { name: 'k', at: 0 }])).toBe('j');
    const all = ['i', 'j', 'k', 'l', 'r', 'm', 'p', 'q', 'p2'].map((name) => ({ name, at: null }));
    expect(freePtrName(all)).toBe('p3');
  });
});

describe('call stack', () => {
  it('pushes a frame with the previous local names and empty values', () => {
    const s = apply(base(), { t: 'call', s: 's5' }).structs.s5 as CallsS;
    expect(s.frames[1]).toEqual({ fn: 'dfs', locals: [['i', ''], ['j', '']] });
  });

  it('pushes a first frame named f', () => {
    const s = apply(board(calls('s1', [])), { t: 'call', s: 's1' }).structs.s1 as CallsS;
    expect(s.frames).toEqual([{ fn: 'f', locals: [] }]);
  });

  it('pops, adds locals, renames and deletes locals', () => {
    let b = apply(base(), { t: 'local', s: 's5', f: 0, name: ' k ' });
    expect((b.structs.s5 as CallsS).frames[0].locals).toEqual([['i', '0'], ['j', '1'], ['k', '']]);
    b = apply(b, { t: 'set', at: { s: 's5', k: 'lname', f: 0, i: 2 }, val: 'lo' });
    b = apply(b, { t: 'del', at: { s: 's5', k: 'lname', f: 0, i: 0 } });
    expect((b.structs.s5 as CallsS).frames[0].locals).toEqual([['j', '1'], ['lo', '']]);
    b = apply(b, { t: 'ret', s: 's5' });
    expect((b.structs.s5 as CallsS).frames).toEqual([]);
  });
});

describe('stack popTo', () => {
  it('pops onto empty space', () => {
    expect((apply(base(), { t: 'popTo', s: 's6', to: null }).structs.s6 as BagS).items).toEqual(['7']);
  });

  it('still pops when the target refuses the value', () => {
    const out = apply(base(), { t: 'popTo', s: 's6', to: { s: 's8', k: 'add' } });
    expect((out.structs.s6 as BagS).items).toEqual(['7']);
    expect((out.structs.s8 as BagS).items).toEqual(['8']);
  });
});

describe('rebuild', () => {
  it('turns an array card into a list with a head pointer named after the card', () => {
    const s = apply(base(), { t: 'rebuild', s: 's1', as: 'list' }).structs.s1 as ListS;
    expect(s).toEqual({
      id: 's1',
      name: 's1',
      kind: 'list',
      nodes: { n1: { val: '1', next: 'n2' }, n2: { val: '2', next: 'n3' }, n3: { val: '3', next: null } },
      ptrs: [{ name: 's1', at: 'n1' }],
    });
  });

  it('turns an array card into a level-order tree and drops the array pointers', () => {
    const b = board(arr('s1', ['1', 'null', '2'], { name: 'root', ptrs: [{ name: 'i', at: 0 }] }));
    const s = apply(b, { t: 'rebuild', s: 's1', as: 'tree' }).structs.s1 as TreeS;
    expect(s.kind).toBe('tree');
    expect(s.nodes).toEqual({ n1: { val: '1', left: null, right: 'n2' }, n2: { val: '2', left: null, right: null } });
    expect(s.ptrs).toEqual([{ name: 'root', at: 'n1' }]);
  });

  it('rebuilds an empty array as an empty pool with a null pointer', () => {
    const s = apply(board(arr('s1', [])), { t: 'rebuild', s: 's1', as: 'list' }).structs.s1 as ListS;
    expect(s.nodes).toEqual({});
    expect(s.ptrs).toEqual([{ name: 's1', at: null }]);
  });
});
