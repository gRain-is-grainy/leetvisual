import { describe, expect, it } from 'vitest';
import type { RObj } from '../../../src/panel/trace/raw';
import { shortName, TEXT_LIMIT, textOf } from '../../../src/panel/trace/text';
import { R } from '../../helpers/raw';

const heapOf = (objs: Record<string, RObj>) => new Map(Object.entries(objs).map(([id, o]): [number, RObj] => [Number(id), o]));

const H = heapOf({
  1: ['LIST', '2', '7', '"a"'],
  2: ['LIST'],
  3: ['TUPLE', '1'],
  4: ['TUPLE'],
  5: ['TUPLE', '1', '"b"'],
  6: ['SET'],
  7: ['SET', '1', '2'],
  8: ['DEQUE', '1', '2'],
  9: ['DEQUE'],
  10: ['DICT', ['"a"', '1'], ['"b"', R(1)]],
  11: ['DICT'],
  12: ['LNODE', '3', R(13)],
  13: ['LNODE', '4', 'None'],
  14: ['TNODE', '5', 'None', 'None'],
  15: ['OBJ', 'Node', [['val', '1'], ['neighbors', R(1)]]],
  16: ['OBJ', 'Solution', []],
  17: ['OBJ', 'NestedInteger', [], '[1, [2]]'],
  18: ['OBJ', 'C', [['a', '1'], ['b', '2'], ['c', '3'], ['d', '4'], ['e', '5']]],
  19: ['LIST', R(1), R(2), R(3), R(4), R(6), R(7), R(8), R(9), R(10), R(11), R(12), R(14), R(15), R(16), R(17)],
  20: ['LIST', R(20)],
});

describe('textOf', () => {
  it('returns primitive and inline texts as written', () => {
    for (const t of ['None', 'True', '-7', '1.5', 'inf', 'nan', '"a\\"b"', '123456789012345678901234567890', '[…]']) {
      expect(textOf(t, H)).toBe(t);
    }
  });

  it('formats each container and node', () => {
    expect(textOf(R(1), H)).toBe('[2, 7, "a"]');
    expect(textOf(R(2), H)).toBe('[]');
    expect(textOf(R(3), H)).toBe('(1,)');
    expect(textOf(R(4), H)).toBe('()');
    expect(textOf(R(5), H)).toBe('(1, "b")');
    expect(textOf(R(6), H)).toBe('set()');
    expect(textOf(R(7), H)).toBe('{1, 2}');
    expect(textOf(R(8), H)).toBe('deque([1, 2])');
    expect(textOf(R(9), H)).toBe('deque([])');
    expect(textOf(R(10), H)).toBe('{"a": 1, "b": […]}');
    expect(textOf(R(11), H)).toBe('{}');
    expect(textOf(R(12), H)).toBe('ListNode(3)');
    expect(textOf(R(14), H)).toBe('TreeNode(5)');
  });

  it('formats objects with at most four fields, or with their repr text', () => {
    expect(textOf(R(15), H)).toBe('Node(val=1, neighbors=[…])');
    expect(textOf(R(16), H)).toBe('Solution()');
    expect(textOf(R(17), H)).toBe('[1, [2]]');
    expect(textOf(R(18), H)).toBe('C(a=1, b=2, c=3, d=4, …)');
  });

  it('abbreviates non-empty containers and objects one level down and keeps nodes in full', () => {
    expect(textOf(R(19), H, 200)).toBe(
      '[[…], [], (…), (), set(), {…}, deque([…]), deque([]), {…}, {}, ListNode(3), TreeNode(5), Node(…), Solution(), [1, [2]]]',
    );
  });

  it('cuts text longer than the limit, ending in …', () => {
    const long = heapOf({ 1: ['LIST', ...Array.from({ length: 60 }, (_, i) => String(i))] });
    const t = textOf(R(1), long);
    expect(t).toHaveLength(TEXT_LIMIT);
    expect(t.startsWith('[0, 1, 2, ')).toBe(true);
    expect(t.endsWith('…')).toBe(true);
    expect(textOf(R(1), long, 10)).toBe('[0, 1, 2,…');
    expect(textOf(`"${'x'.repeat(150)}"`, H)).toHaveLength(100);
  });

  // Review Focus 2
  it('shows … for a reference with no entry, also as an item', () => {
    const h = heapOf({ 1: ['LIST', R(99), '1'] });
    expect(textOf(R(99), h)).toBe('…');
    expect(textOf(R(1), h)).toBe('[…, 1]');
  });

  // Review Focus 3
  it('terminates on a list that contains itself', () => {
    expect(textOf(R(20), H)).toBe('[[…]]');
  });
});

describe('shortName', () => {
  it('keeps the part after the last dot of a qualified name', () => {
    expect(shortName('Solution.numIslands.<locals>.dfs')).toBe('dfs');
    expect(shortName('Solution.twoSum')).toBe('twoSum');
    expect(shortName('Solution.f.<locals>.<lambda>')).toBe('<lambda>');
    expect(shortName('helper')).toBe('helper');
  });
});
