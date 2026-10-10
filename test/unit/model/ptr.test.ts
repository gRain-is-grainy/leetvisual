import { describe, expect, it } from 'vitest';
import { stepPtr } from '../../../src/panel/model/ptr';
import { arr, grid, list, tree } from '../../helpers/boards';

describe('stepPtr: arrays', () => {
  const a = arr('s1', ['1', '2', '3'], { ptrs: [{ name: 'i', at: 0 }, { name: 'j', at: 2 }, { name: 'z', at: null }] });

  it('moves one cell left or right', () => {
    expect(stepPtr(a, 'i', 'right')).toBe(1);
    expect(stepPtr(a, 'j', 'left')).toBe(1);
  });

  it('stops at both bounds', () => {
    expect(stepPtr(a, 'i', 'left')).toBeUndefined();
    expect(stepPtr(a, 'j', 'right')).toBeUndefined();
  });

  it('ignores up and down, null pointers and unknown names', () => {
    expect(stepPtr(a, 'i', 'up')).toBeUndefined();
    expect(stepPtr(a, 'z', 'right')).toBeUndefined();
    expect(stepPtr(a, 'nope', 'right')).toBeUndefined();
  });
});

describe('stepPtr: grids', () => {
  const g = grid('s1', [['a', 'b', 'c'], ['d'], []], { ptrs: [{ name: 'p', at: [0, 2] }, { name: 'q', at: [1, 0] }] });

  it('moves in four directions', () => {
    expect(stepPtr(g, 'p', 'left')).toEqual([0, 1]);
    expect(stepPtr(g, 'q', 'up')).toEqual([0, 0]);
  });

  it('clamps the column to a shorter row', () => {
    expect(stepPtr(g, 'p', 'down')).toEqual([1, 0]);
  });

  it('stops at edges, at row ends and before empty rows', () => {
    expect(stepPtr(g, 'p', 'right')).toBeUndefined();
    expect(stepPtr(g, 'p', 'up')).toBeUndefined();
    expect(stepPtr(g, 'q', 'down')).toBeUndefined();
    expect(stepPtr(g, 'q', 'left')).toBeUndefined();
  });
});

describe('stepPtr: lists', () => {
  const l = list(
    's1',
    { n1: { val: '1', next: 'n3' }, n2: { val: '2', next: 'n3' }, n3: { val: '3', next: null } },
    { ptrs: [{ name: 'a', at: 'n1' }, { name: 'b', at: 'n3' }] },
  );

  it('follows next to the right', () => {
    expect(stepPtr(l, 'a', 'right')).toBe('n3');
    expect(stepPtr(l, 'b', 'right')).toBeUndefined();
  });

  it('goes to the predecessor with the lowest id to the left', () => {
    expect(stepPtr(l, 'b', 'left')).toBe('n1');
    expect(stepPtr(l, 'a', 'left')).toBeUndefined();
  });

  it('ignores up and down', () => {
    expect(stepPtr(l, 'a', 'down')).toBeUndefined();
  });
});

describe('stepPtr: trees', () => {
  const t = tree(
    's1',
    {
      n1: { val: '1', left: 'n2', right: 'n3' },
      n2: { val: '2', left: null, right: 'n4' },
      n3: { val: '3', left: null, right: null },
      n4: { val: '4', left: null, right: null },
    },
    { ptrs: [{ name: 'r', at: 'n1' }, { name: 'x', at: 'n2' }, { name: 'y', at: 'n4' }] },
  );

  it('goes to the left and right children', () => {
    expect(stepPtr(t, 'r', 'left')).toBe('n2');
    expect(stepPtr(t, 'r', 'right')).toBe('n3');
  });

  it('goes down to the left child, else the right child', () => {
    expect(stepPtr(t, 'r', 'down')).toBe('n2');
    expect(stepPtr(t, 'x', 'down')).toBe('n4');
    expect(stepPtr(t, 'y', 'down')).toBeUndefined();
  });

  it('goes up to the parent', () => {
    expect(stepPtr(t, 'y', 'up')).toBe('n2');
    expect(stepPtr(t, 'r', 'up')).toBeUndefined();
  });
});
