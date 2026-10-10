import { describe, expect, it } from 'vitest';
import { apply, putVal, type Op } from '../../../src/panel/model/ops';
import type { ArrayS, BagS, MapS, VarS } from '../../../src/panel/model/types';
import { arr, bag, board, map, v } from '../../helpers/boards';

const base = () =>
  board(
    arr('s1', ['3', '1', '2'], { ptrs: [{ name: 'i', at: 2 }, { name: 'j', at: 0 }] }),
    v('s2', '0'),
    map('s3', [['"a"', '1']]),
    bag('s4', 'set', ['1']),
    bag('s5', 'stack', ['1', '2']),
    bag('s6', 'queue', ['1', '2']),
  );

// [operation, the only structure it may replace]
const changes: [Op, string][] = [
  [{ t: 'add', struct: v('s9', '1') }, 's9'],
  [{ t: 'remove', s: 's2' }, 's2'],
  [{ t: 'rename', s: 's2', name: 'x' }, 's2'],
  [{ t: 'set', at: { s: 's1', k: 'item', i: 0 }, val: '9' }, 's1'],
  [{ t: 'set', at: { s: 's2', k: 'var' }, val: '5' }, 's2'],
  [{ t: 'set', at: { s: 's3', k: 'key', i: 0 }, val: '"b"' }, 's3'],
  [{ t: 'set', at: { s: 's3', k: 'val', i: 0 }, val: '2' }, 's3'],
  [{ t: 'swap', s: 's1', i: 0, j: 2 }, 's1'],
  [{ t: 'push', s: 's1', val: '4' }, 's1'],
  [{ t: 'push', s: 's4', val: '2' }, 's4'],
  [{ t: 'push', s: 's5', val: '3' }, 's5'],
  [{ t: 'push', s: 's6', val: '3' }, 's6'],
  [{ t: 'pop', s: 's1' }, 's1'],
  [{ t: 'pop', s: 's5' }, 's5'],
  [{ t: 'shift', s: 's6' }, 's6'],
  [{ t: 'del', at: { s: 's4', k: 'item', i: 0 } }, 's4'],
  [{ t: 'del', at: { s: 's3', k: 'val', i: 0 } }, 's3'],
  [{ t: 'putKey', s: 's3', key: '"z"' }, 's3'],
];

describe('apply: purity', () => {
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

  it('keeps the card order when a structure changes', () => {
    const out = apply(base(), { t: 'set', at: { s: 's1', k: 'item', i: 0 }, val: '9' });
    expect(Object.keys(out.structs)).toEqual(['s1', 's2', 's3', 's4', 's5', 's6']);
  });
});

const noops: [string, Op][] = [
  ['adding an existing id', { t: 'add', struct: v('s2', '1') }],
  ['removing a missing card', { t: 'remove', s: 's9' }],
  ['renaming to blank', { t: 'rename', s: 's2', name: '   ' }],
  ['renaming to the same name', { t: 'rename', s: 's2', name: 's2' }],
  ['setting an equal value', { t: 'set', at: { s: 's1', k: 'item', i: 0 }, val: '3' }],
  ['setting out of range', { t: 'set', at: { s: 's1', k: 'item', i: 3 }, val: '3' }],
  ['setting a set item to a present value', { t: 'set', at: { s: 's4', k: 'item', i: 0 }, val: '1' }],
  ['setting a map key to a used key', { t: 'set', at: { s: 's3', k: 'key', i: 0 }, val: '"a"' }],
  ['setting the add target', { t: 'set', at: { s: 's4', k: 'add' }, val: '5' }],
  ['setting a var through an item loc', { t: 'set', at: { s: 's2', k: 'item', i: 0 }, val: '5' }],
  ['swapping a cell with itself', { t: 'swap', s: 's1', i: 1, j: 1 }],
  ['swapping out of range', { t: 'swap', s: 's1', i: 0, j: 7 }],
  ['adding a present value to a set', { t: 'push', s: 's4', val: '1' }],
  ['pushing onto a var', { t: 'push', s: 's2', val: '1' }],
  ['putting an existing key', { t: 'putKey', s: 's3', key: '"a"' }],
  ['deleting a middle array cell', { t: 'del', at: { s: 's1', k: 'item', i: 0 } }],
  ['deleting a stack item', { t: 'del', at: { s: 's5', k: 'item', i: 0 } }],
  ['deleting a missing map entry', { t: 'del', at: { s: 's3', k: 'key', i: 4 } }],
];

describe('apply: no-ops return the same board', () => {
  it.each(noops)('%s', (_, op) => {
    const b = base();
    expect(apply(b, op)).toBe(b);
  });

  it('popping an empty stack or array and dequeuing an empty queue', () => {
    const b = board(arr('s1', []), bag('s2', 'stack', []), bag('s3', 'queue', []));
    expect(apply(b, { t: 'pop', s: 's1' })).toBe(b);
    expect(apply(b, { t: 'pop', s: 's2' })).toBe(b);
    expect(apply(b, { t: 'shift', s: 's3' })).toBe(b);
  });

  it('setting a set item to a value another item holds', () => {
    const b = board(bag('s1', 'set', ['1', '2']));
    expect(apply(b, { t: 'set', at: { s: 's1', k: 'item', i: 0 }, val: '2' })).toBe(b);
  });
});

describe('apply: results', () => {
  const at = (b: ReturnType<typeof base>, id: string) => b.structs[id];

  it('swaps two cells and leaves pointers on their indexes', () => {
    const s = at(apply(base(), { t: 'swap', s: 's1', i: 0, j: 2 }), 's1') as ArrayS;
    expect(s.items).toEqual(['2', '1', '3']);
    expect(s.ptrs).toEqual([{ name: 'i', at: 2 }, { name: 'j', at: 0 }]);
  });

  it('moves pointers off a popped cell to the new last cell', () => {
    const s = at(apply(base(), { t: 'pop', s: 's1' }), 's1') as ArrayS;
    expect(s.items).toEqual(['3', '1']);
    expect(s.ptrs).toEqual([{ name: 'i', at: 1 }, { name: 'j', at: 0 }]);
  });

  it('sets pointers to null when the array becomes empty', () => {
    const b = board(arr('s1', ['5'], { ptrs: [{ name: 'i', at: 0 }] }));
    expect((apply(b, { t: 'pop', s: 's1' }).structs.s1 as ArrayS).ptrs).toEqual([{ name: 'i', at: null }]);
  });

  it('deleting the last array cell pops it', () => {
    const s = at(apply(base(), { t: 'del', at: { s: 's1', k: 'item', i: 2 } }), 's1') as ArrayS;
    expect(s.items).toEqual(['3', '1']);
  });

  it('pushes, pops and dequeues at the right ends', () => {
    expect((at(apply(base(), { t: 'push', s: 's5', val: '3' }), 's5') as BagS).items).toEqual(['1', '2', '3']);
    expect((at(apply(base(), { t: 'pop', s: 's5' }), 's5') as BagS).items).toEqual(['1']);
    expect((at(apply(base(), { t: 'shift', s: 's6' }), 's6') as BagS).items).toEqual(['2']);
  });

  it('edits map keys and values and deletes entries', () => {
    const b1 = apply(base(), { t: 'set', at: { s: 's3', k: 'key', i: 0 }, val: '"b"' });
    expect((b1.structs.s3 as MapS).entries).toEqual([['"b"', '1']]);
    const b2 = apply(b1, { t: 'putKey', s: 's3', key: '7' });
    expect((b2.structs.s3 as MapS).entries).toEqual([['"b"', '1'], ['7', '']]);
    const b3 = apply(b2, { t: 'del', at: { s: 's3', k: 'key', i: 0 } });
    expect((b3.structs.s3 as MapS).entries).toEqual([['7', '']]);
  });

  it('trims names on rename and keeps literals untrimmed', () => {
    expect(apply(base(), { t: 'rename', s: 's2', name: '  total ' }).structs.s2.name).toBe('total');
    expect((apply(base(), { t: 'set', at: { s: 's2', k: 'var' }, val: '" a "' }).structs.s2 as VarS).value).toBe('" a "');
  });

  it('removes a card', () => {
    expect(Object.keys(apply(base(), { t: 'remove', s: 's2' }).structs)).toEqual(['s1', 's3', 's4', 's5', 's6']);
  });
});

describe('putVal', () => {
  it('copies into slots and adds to containers', () => {
    const b = base();
    expect((putVal(b, '8', { s: 's2', k: 'var' }).structs.s2 as VarS).value).toBe('8');
    expect((putVal(b, '8', { s: 's4', k: 'add' }).structs.s4 as BagS).items).toEqual(['1', '8']);
    expect((putVal(b, '8', { s: 's5', k: 'add' }).structs.s5 as BagS).items).toEqual(['1', '2', '8']);
    expect((putVal(b, '8', { s: 's6', k: 'add' }).structs.s6 as BagS).items).toEqual(['1', '2', '8']);
    expect((putVal(b, '8', { s: 's3', k: 'add' }).structs.s3 as MapS).entries).toEqual([['"a"', '1'], ['8', '']]);
  });

  it('is a no-op for an add target on a structure without one', () => {
    const b = base();
    expect(putVal(b, '8', { s: 's1', k: 'add' })).toBe(b);
    expect(putVal(b, '8', { s: 's9', k: 'add' })).toBe(b);
  });
});
