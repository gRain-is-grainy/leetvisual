import { describe, expect, it } from 'vitest';
import type { Structure } from '../../../src/panel/model/types';
import { changedIdx, changedPtrs } from '../../../src/panel/views/diff';
import { isLarge, MAX_GRID, MAX_ITEMS, MAX_NODES } from '../../../src/panel/views/limits';
import { shownText } from '../../../src/panel/views/text';

describe('shownText', () => {
  it('unquotes string tokens only when asked', () => {
    expect(shownText('"a"', true)).toBe('a');
    expect(shownText('"a"', false)).toBe('"a"');
    expect(shownText('7', true)).toBe('7');
    expect(shownText('null', true)).toBe('null');
  });

  it('decodes escapes and keeps unicode', () => {
    expect(shownText('"\\""', true)).toBe('"');
    expect(shownText('"é😀"', true)).toBe('é😀');
    expect(shownText('', true)).toBe('');
  });
});

describe('changedIdx', () => {
  it('is empty without a previous array or for the same array', () => {
    const a = ['1', '2'];
    expect(changedIdx(undefined, a).size).toBe(0);
    expect(changedIdx(a, a).size).toBe(0);
  });

  it('marks differing and appended indexes', () => {
    expect([...changedIdx(['1', '2'], ['1', '3', '4'])]).toEqual([1, 2]);
  });

  it('compares literal text, so "7" and 7 differ', () => {
    expect([...changedIdx(['7'], ['"7"'])]).toEqual([0]);
  });
});

describe('changedPtrs', () => {
  it('marks moved and new pointers, including grid pairs by value', () => {
    const prev = [
      { name: 'i', at: 0 },
      { name: 'g', at: [1, 2] as [number, number] },
    ];
    const cur = [
      { name: 'i', at: 1 },
      { name: 'g', at: [1, 2] as [number, number] },
      { name: 'j', at: null },
    ];
    expect([...changedPtrs(prev, cur)]).toEqual(['i', 'j']);
    expect(changedPtrs(undefined, cur).size).toBe(0);
  });
});

describe('isLarge', () => {
  const items = (n: number) => Array.from({ length: n }, (_, i) => String(i));
  it('uses the spec limits per kind', () => {
    const a = (n: number): Structure => ({ id: 's1', name: 'a', kind: 'array', items: items(n), ptrs: [] });
    expect(isLarge(a(MAX_ITEMS))).toBe(false);
    expect(isLarge(a(MAX_ITEMS + 1))).toBe(true);
    const g = (r: number, c: number): Structure => ({ id: 's2', name: 'g', kind: 'grid', rows: Array.from({ length: r }, () => items(c)), marked: [], ptrs: [] });
    expect(isLarge(g(MAX_GRID, MAX_GRID))).toBe(false);
    expect(isLarge(g(MAX_GRID + 1, 1))).toBe(true);
    expect(isLarge(g(1, MAX_GRID + 1))).toBe(true);
    const t = (n: number): Structure => ({
      id: 's3',
      name: 't',
      kind: 'tree',
      nodes: Object.fromEntries(items(n).map((v, i) => [`n${i + 1}`, { val: v, left: null, right: null }])),
      ptrs: [],
    });
    expect(isLarge(t(MAX_NODES))).toBe(false);
    expect(isLarge(t(MAX_NODES + 1))).toBe(true);
    expect(isLarge({ id: 's4', name: 'x', kind: 'var', value: '1' })).toBe(false);
  });
});
