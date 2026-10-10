import { describe, expect, it } from 'vitest';
import { canEdit, deleteOp, resolveDrop, srcLabel } from '../../../src/panel/model/drop';
import type { Loc, Sel, Src } from '../../../src/panel/model/loc';
import { arr, bag, board, calls, grid, list, map, tree, v } from '../../helpers/boards';

const b = board(
  arr('s1', ['1', '2', '3'], { ptrs: [{ name: 'i', at: 0 }] }),
  arr('s2', ['9']),
  grid('s3', [['0', '1']], { ptrs: [{ name: 'p', at: [0, 0] }] }),
  list('s4', { n1: { val: '1', next: 'n2' }, n2: { val: '2', next: null } }, { ptrs: [{ name: 'cur', at: 'n1' }] }),
  tree('s5', { n1: { val: '1', left: null, right: null }, n2: { val: '2', left: null, right: null } }),
  map('s6', [['"a"', '1']]),
  bag('s7', 'set', ['1']),
  bag('s8', 'stack', ['4', '5']),
  bag('s9', 'queue', ['6', '7']),
  v('s10', '0'),
  calls('s11', [{ fn: 'dfs', locals: [['i', '0']] }]),
);

const val = (at: Loc): Src => ({ t: 'val', at });
const item = (s: string, i: number): Loc => ({ s, k: 'item', i });

describe('resolveDrop: values', () => {
  const one = val(item('s1', 0));

  it('swaps cells of the same array', () => {
    expect(resolveDrop(b, one, item('s1', 2))).toEqual({ t: 'swap', s: 's1', i: 0, j: 2 });
  });

  it.each<[string, Loc]>([
    ['a cell of another array', item('s2', 0)],
    ['a grid cell', { s: 's3', k: 'cell', r: 0, c: 1 }],
    ['a list node', { s: 's4', k: 'node', n: 'n2' }],
    ['a tree node', { s: 's5', k: 'node', n: 'n1' }],
    ['a map key', { s: 's6', k: 'key', i: 0 }],
    ['a map value', { s: 's6', k: 'val', i: 0 }],
    ['a variable', { s: 's10', k: 'var' }],
    ['a local', { s: 's11', k: 'local', f: 0, i: 0 }],
  ])('copies the value into %s', (_, to) => {
    expect(resolveDrop(b, one, to)).toEqual({ t: 'set', at: to, val: '1' });
  });

  it('adds to containers', () => {
    expect(resolveDrop(b, one, { s: 's7', k: 'add' })).toEqual({ t: 'push', s: 's7', val: '1' });
    expect(resolveDrop(b, one, { s: 's8', k: 'add' })).toEqual({ t: 'push', s: 's8', val: '1' });
    expect(resolveDrop(b, one, { s: 's9', k: 'add' })).toEqual({ t: 'push', s: 's9', val: '1' });
    expect(resolveDrop(b, one, { s: 's6', k: 'add' })).toEqual({ t: 'putKey', s: 's6', key: '1' });
  });

  it.each<[string, Src, Loc | null]>([
    ['empty space', one, null],
    ['itself', one, item('s1', 0)],
    ['a missing cell', one, item('s2', 4)],
    ['a set item', one, item('s7', 0)],
    ['a function name', one, { s: 's11', k: 'fn', f: 0 }],
    ['a local name', one, { s: 's11', k: 'lname', f: 0, i: 0 }],
    ['an array add target', one, { s: 's2', k: 'add' }],
    ['its own set', val(item('s7', 0)), { s: 's7', k: 'add' }],
    ['a missing card', one, { s: 's99', k: 'var' }],
    ['anything, from a missing value', val(item('s1', 9)), item('s2', 0)],
  ])('refuses %s', (_, src, to) => {
    expect(resolveDrop(b, src, to)).toBeNull();
  });
});

describe('resolveDrop: the stack top', () => {
  const top = val(item('s8', 1));

  it('pops onto empty space', () => {
    expect(resolveDrop(b, top, null)).toEqual({ t: 'pop', s: 's8' });
  });

  it('pops and copies onto a value target', () => {
    expect(resolveDrop(b, top, { s: 's10', k: 'var' })).toEqual({ t: 'popTo', s: 's8', to: { s: 's10', k: 'var' } });
    expect(resolveDrop(b, top, { s: 's7', k: 'add' })).toEqual({ t: 'popTo', s: 's8', to: { s: 's7', k: 'add' } });
  });

  it('refuses its own stack and targets that do not take values', () => {
    expect(resolveDrop(b, top, { s: 's8', k: 'add' })).toBeNull();
    expect(resolveDrop(b, top, { s: 's11', k: 'fn', f: 0 })).toBeNull();
  });

  it('treats a lower stack item as a plain value', () => {
    expect(resolveDrop(b, val(item('s8', 0)), null)).toBeNull();
    expect(resolveDrop(b, val(item('s8', 0)), { s: 's10', k: 'var' })).toEqual({ t: 'set', at: { s: 's10', k: 'var' }, val: '4' });
  });
});

describe('resolveDrop: links', () => {
  const next: Src = { t: 'link', s: 's4', n: 'n2', side: 'next' };

  it('links to a node of the same pool or to null', () => {
    expect(resolveDrop(b, next, { s: 's4', k: 'node', n: 'n1' })).toEqual({ t: 'link', s: 's4', n: 'n2', side: 'next', to: 'n1' });
    expect(resolveDrop(b, next, null)).toEqual({ t: 'link', s: 's4', n: 'n2', side: 'next', to: null });
    expect(resolveDrop(b, { t: 'link', s: 's5', n: 'n1', side: 'left' }, { s: 's5', k: 'node', n: 'n2' })).toEqual({
      t: 'link', s: 's5', n: 'n1', side: 'left', to: 'n2',
    });
  });

  it('refuses other structures, wrong sides and missing nodes', () => {
    expect(resolveDrop(b, next, { s: 's5', k: 'node', n: 'n1' })).toBeNull();
    expect(resolveDrop(b, next, item('s1', 0))).toBeNull();
    expect(resolveDrop(b, { t: 'link', s: 's4', n: 'n2', side: 'left' }, null)).toBeNull();
    expect(resolveDrop(b, { t: 'link', s: 's5', n: 'n1', side: 'next' }, null)).toBeNull();
    expect(resolveDrop(b, { t: 'link', s: 's4', n: 'n9', side: 'next' }, null)).toBeNull();
  });
});

describe('resolveDrop: pointers', () => {
  it('moves onto a cell or node of its own structure', () => {
    expect(resolveDrop(b, { t: 'ptr', s: 's1', name: 'i' }, item('s1', 2))).toEqual({ t: 'ptr', s: 's1', name: 'i', at: 2 });
    expect(resolveDrop(b, { t: 'ptr', s: 's3', name: 'p' }, { s: 's3', k: 'cell', r: 0, c: 1 })).toEqual({
      t: 'ptr', s: 's3', name: 'p', at: [0, 1],
    });
    expect(resolveDrop(b, { t: 'ptr', s: 's4', name: 'cur' }, { s: 's4', k: 'node', n: 'n2' })).toEqual({
      t: 'ptr', s: 's4', name: 'cur', at: 'n2',
    });
  });

  it('is set to null when dropped off its structure', () => {
    const off = { t: 'ptr', s: 's1', name: 'i', at: null };
    expect(resolveDrop(b, { t: 'ptr', s: 's1', name: 'i' }, null)).toEqual(off);
    expect(resolveDrop(b, { t: 'ptr', s: 's1', name: 'i' }, item('s2', 0))).toEqual(off);
  });

  it('refuses unknown pointers and non-cell targets in its structure', () => {
    expect(resolveDrop(b, { t: 'ptr', s: 's1', name: 'zz' }, null)).toBeNull();
    expect(resolveDrop(b, { t: 'ptr', s: 's1', name: 'i' }, { s: 's1', k: 'add' })).toBeNull();
  });
});

describe('deleteOp', () => {
  const del = (sel: Sel) => deleteOp(b, sel);
  const at = (l: Loc): Sel => ({ t: 'val', at: l });

  it('removes cards and pointers', () => {
    expect(del({ t: 'card', s: 's2' })).toEqual({ t: 'remove', s: 's2' });
    expect(del({ t: 'ptr', s: 's1', name: 'i' })).toEqual({ t: 'unptr', s: 's1', name: 'i' });
  });

  it('removes only at the end of arrays and stacks and the front of queues', () => {
    expect(del(at(item('s1', 2)))).toEqual({ t: 'pop', s: 's1' });
    expect(del(at(item('s1', 0)))).toBeNull();
    expect(del(at(item('s8', 1)))).toEqual({ t: 'pop', s: 's8' });
    expect(del(at(item('s8', 0)))).toBeNull();
    expect(del(at(item('s9', 0)))).toEqual({ t: 'shift', s: 's9' });
    expect(del(at(item('s9', 1)))).toBeNull();
  });

  it('deletes set items, map entries, nodes and locals', () => {
    for (const l of [item('s7', 0), { s: 's6', k: 'key', i: 0 }, { s: 's6', k: 'val', i: 0 }, { s: 's4', k: 'node', n: 'n1' },
      { s: 's11', k: 'local', f: 0, i: 0 }, { s: 's11', k: 'lname', f: 0, i: 0 }] as Loc[]) {
      expect(del(at(l))).toEqual({ t: 'del', at: l });
    }
  });

  it('does nothing for grid cells, variables, function names, links and missing things', () => {
    expect(del(at({ s: 's3', k: 'cell', r: 0, c: 0 }))).toBeNull();
    expect(del(at({ s: 's10', k: 'var' }))).toBeNull();
    expect(del(at({ s: 's11', k: 'fn', f: 0 }))).toBeNull();
    expect(del({ t: 'link', s: 's4', n: 'n1', side: 'next' })).toBeNull();
    expect(del({ t: 'card', s: 's99' })).toBeNull();
    expect(del({ t: 'ptr', s: 's1', name: 'zz' })).toBeNull();
    expect(del(at(item('s7', 5)))).toBeNull();
  });
});

describe('canEdit', () => {
  it('allows cards, pointers and existing value slots', () => {
    expect(canEdit(b, { t: 'card', s: 's1' })).toBe(true);
    expect(canEdit(b, { t: 'ptr', s: 's1', name: 'i' })).toBe(true);
    for (const l of [item('s1', 0), { s: 's3', k: 'cell', r: 0, c: 1 }, { s: 's5', k: 'node', n: 'n2' }, { s: 's6', k: 'key', i: 0 },
      { s: 's10', k: 'var' }, { s: 's11', k: 'fn', f: 0 }, { s: 's11', k: 'lname', f: 0, i: 0 }] as Loc[]) {
      expect(canEdit(b, { t: 'val', at: l })).toBe(true);
    }
  });

  it('refuses links, add targets and missing things', () => {
    expect(canEdit(b, { t: 'link', s: 's4', n: 'n1', side: 'next' })).toBe(false);
    expect(canEdit(b, { t: 'val', at: { s: 's7', k: 'add' } })).toBe(false);
    expect(canEdit(b, { t: 'val', at: item('s1', 7) })).toBe(false);
    expect(canEdit(b, { t: 'card', s: 's99' })).toBe(false);
    expect(canEdit(b, { t: 'ptr', s: 's10', name: 'i' })).toBe(false);
  });
});

describe('srcLabel', () => {
  it('shows the value, the pointer name or the link side', () => {
    expect(srcLabel(b, val(item('s6', 0)))).toBe('');
    expect(srcLabel(b, val({ s: 's6', k: 'key', i: 0 }))).toBe('"a"');
    expect(srcLabel(b, { t: 'ptr', s: 's1', name: 'i' })).toBe('i');
    expect(srcLabel(b, { t: 'link', s: 's5', n: 'n1', side: 'right' })).toBe('right');
  });
});
