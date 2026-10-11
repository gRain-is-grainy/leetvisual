import { describe, expect, it } from 'vitest';
import type { ArrayS, GridS } from '../../../src/panel/model/types';
import type { RObj } from '../../../src/panel/trace/raw';
import { boardAt, facts, one, R } from '../../helpers/raw';

const nums: Record<string, RObj> = { 1: ['LIST', '2', '7', '11'] };
const grid: Record<string, RObj> = { 1: ['LIST', R(2), R(3)], 2: ['LIST', '"1"', '"0"'], 3: ['LIST', '"0"', '"1"'] };

describe('mapBoard: cursors', () => {
  it('puts an int bound to an array card on it as a pointer chip, instead of a var card', () => {
    const b = boardAt(one({ nums: R(1), i: '1' }, nums, { facts: facts({ cursors: [['nums', 'i']] }) })).structs;
    expect((b['t:nums'] as ArrayS).ptrs).toEqual([{ name: 'i', at: 1 }]);
    expect(b['t:i']).toBeUndefined();
  });

  it('keeps a cursor at the length or below zero on the card', () => {
    const b = boardAt(one({ nums: R(1), i: '3', j: '-1' }, nums, { facts: facts({ cursors: [['nums', 'i'], ['nums', 'j']] }) })).structs;
    expect((b['t:nums'] as ArrayS).ptrs).toEqual([
      { name: 'i', at: 3 },
      { name: 'j', at: -1 },
    ]);
  });

  it('binds one int to several arrays', () => {
    const raw = one({ a: R(1), b: R(2), i: '0' }, { 1: ['LIST', '1'], 2: ['LIST', '2'] }, { facts: facts({ cursors: [['a', 'i'], ['b', 'i']] }) });
    const b = boardAt(raw).structs;
    expect((b['t:a'] as ArrayS).ptrs).toEqual([{ name: 'i', at: 0 }]);
    expect((b['t:b'] as ArrayS).ptrs).toEqual([{ name: 'i', at: 0 }]);
    expect(b['t:i']).toBeUndefined();
  });

  it('leaves the int a var when its container is not a card in this frame, or not an array', () => {
    const raw = one({ i: '1', d: R(2) }, { 2: ['DICT'] }, { facts: facts({ cursors: [['nums', 'i'], ['d', 'i']] }) });
    expect(boardAt(raw).structs['t:i']).toEqual({ id: 't:i', name: 'i', kind: 'var', value: '1' });
  });

  it('binds only ints whose absolute value is below 2^31', () => {
    for (const i of ['1.5', 'True', '"3"', 'None', '2147483648', '-2147483648']) {
      const b = boardAt(one({ nums: R(1), i }, nums, { facts: facts({ cursors: [['nums', 'i']] }) })).structs;
      expect((b['t:nums'] as ArrayS).ptrs).toEqual([]);
      expect(b['t:i']).toMatchObject({ kind: 'var', value: i });
    }
    const b = boardAt(one({ nums: R(1), i: '2147483647' }, nums, { facts: facts({ cursors: [['nums', 'i']] }) })).structs;
    expect((b['t:nums'] as ArrayS).ptrs).toEqual([{ name: 'i', at: 2147483647 }]);
  });

  it('puts a grid pair on its grid card as one chip named r,c and drops both vars', () => {
    const b = boardAt(one({ grid: R(1), r: '1', c: '0' }, grid, { facts: facts({ grids: [['grid', 'r', 'c']] }) })).structs;
    expect((b['t:grid'] as GridS).ptrs).toEqual([{ name: 'r,c', at: [1, 0] }]);
    expect(b['t:r']).toBeUndefined();
    expect(b['t:c']).toBeUndefined();
  });

  it('keeps a grid pair outside the drawn cells on the card', () => {
    const b = boardAt(one({ grid: R(1), r: '5', c: '-1' }, grid, { facts: facts({ grids: [['grid', 'r', 'c']] }) })).structs;
    expect((b['t:grid'] as GridS).ptrs).toEqual([{ name: 'r,c', at: [5, -1] }]);
  });

  it('needs both halves of a pair to be ints and its container to be a grid', () => {
    const half = boardAt(one({ grid: R(1), r: '1', c: 'None' }, grid, { facts: facts({ grids: [['grid', 'r', 'c']] }) })).structs;
    expect((half['t:grid'] as GridS).ptrs).toEqual([]);
    expect(half['t:r']).toMatchObject({ kind: 'var', value: '1' });
    expect(half['t:c']).toMatchObject({ kind: 'var', value: 'None' });
    const flat = boardAt(one({ g: R(1), r: '0', c: '0' }, nums, { facts: facts({ grids: [['g', 'r', 'c']] }) })).structs;
    expect((flat['t:g'] as ArrayS).ptrs).toEqual([]);
    expect(flat['t:r']).toBeDefined();
  });

  it('binds to self fields and to character arrays', () => {
    const raw = one(
      { self: R(1), i: '0', s: '"ab"', j: '1' },
      { 1: ['OBJ', 'Solution', [['dp', R(2)]]], 2: ['LIST', '0', '0'] },
      { facts: facts({ cursors: [['self.dp', 'i'], ['s', 'j']], strs: ['s'] }) },
    );
    const b = boardAt(raw).structs;
    expect((b['t:self.dp'] as ArrayS).ptrs).toEqual([{ name: 'i', at: 0 }]);
    expect(b['t:s']).toMatchObject({ kind: 'array', chars: true, ptrs: [{ name: 'j', at: 1 }] });
    expect(b['t:i']).toBeUndefined();
    expect(b['t:j']).toBeUndefined();
  });

  it('adds a cursor once even when the facts repeat it', () => {
    const b = boardAt(one({ nums: R(1), i: '0' }, nums, { facts: facts({ cursors: [['nums', 'i'], ['nums', 'i']] }) })).structs;
    expect((b['t:nums'] as ArrayS).ptrs).toEqual([{ name: 'i', at: 0 }]);
  });
});
