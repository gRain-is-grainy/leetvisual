import type { PyodideAPI } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import type { RObj } from '../../../src/panel/trace/raw';
import { loadHarness, pyJson } from '../../helpers/py';

let py: PyodideAPI;
beforeAll(async () => {
  py = await loadHarness();
  py.runPython(`
import json, lv_trace, lv_nodes
from collections import deque, Counter, defaultdict, OrderedDict
from sortedcontainers import SortedList, SortedDict, SortedSet
def heap(*roots):
    """Walk roots as depth-0 objects with a new Recorder: {'heap': id -> entry, 'truncated': bool}."""
    rec = lv_trace.Recorder({})
    seen = rec.walk([(r, 0) for r in roots])
    return json.dumps({'heap': {str(i): e for i, (_, e) in seen.items()}, 'truncated': rec.truncated})
`);
}, 60_000);

type Walk = { heap: Record<string, RObj>; truncated: boolean };
const walk = (setup: string, roots: string) => pyJson<Walk>(py, `${setup}\nheap(${roots})`);
const local = (expr: string) =>
  pyJson<{ v: unknown; truncated: boolean }>(py, `rec = lv_trace.Recorder({})\njson.dumps({'v': rec.local(${expr}, []), 'truncated': rec.truncated})`);
const text = (expr: string) => pyJson<string>(py, `json.dumps(lv_trace.Recorder({}).text(${expr}))`);

describe('primitives', () => {
  it.each([
    ['None', 'None'],
    ['True', 'True'],
    ['False', 'False'],
    ['-7', '-7'],
    ['10**30', '1000000000000000000000000000000'],
    ['10**5000', '<int>'],
    ['1.5', '1.5'],
    ["float('inf')", 'inf'],
    ["float('-inf')", '-inf'],
    ["float('nan')", 'nan'],
    ["'ab\"c'", '"ab\\"c"'],
    ["'é😀'", '"é😀"'],
  ])('shows %s as %s', (expr, want) => {
    expect(local(expr)).toEqual({ v: want, truncated: false });
  });

  it('cuts a local string at 200 characters, with no marker, and marks the trace truncated', () => {
    const r = local("'x' * 250");
    expect(r.v).toBe(`"${'x'.repeat(200)}"`);
    expect(r.truncated).toBe(true);
  });
});

describe('entries', () => {
  it('encodes each container kind shallowly, with string items JSON-quoted', () => {
    const w = walk('', `[1, 'a', None], (1, 2), {3}, frozenset([4]), deque([5]), {'k': 1.5}, Counter('aa'), defaultdict(list), OrderedDict(a=1), SortedDict({2: 0, 1: 0}), SortedList([2, 1]), SortedSet([3, 1])`);
    expect(Object.values(w.heap)).toEqual([
      ['LIST', '1', '"a"', 'None'],
      ['TUPLE', '1', '2'],
      ['SET', '3'],
      ['SET', '4'],
      ['DEQUE', '5'],
      ['DICT', ['"k"', '1.5']],
      ['DICT', ['"a"', '2']],
      ['DICT'],
      ['DICT', ['"a"', '1']],
      ['DICT', ['1', '0'], ['2', '0']],
      ['LIST', '1', '2'],
      ['SET', '1', '3'],
    ]);
    expect(w.truncated).toBe(false);
  });

  it('references nodes and walks their links: val, next / left, right', () => {
    const w = walk('head = lv_nodes.build_list([1, 2]); root = lv_nodes.build_tree([3, None, 4])', 'head, root');
    // A child gets its id while its parent is encoded, before the next root is visited.
    expect(w.heap).toEqual({
      1: ['LNODE', '1', ['R', 2]],
      2: ['LNODE', '2', 'None'],
      3: ['TNODE', '3', 'None', ['R', 4]],
      4: ['TNODE', '4', 'None', 'None'],
    });
  });

  it('references lists inside lists down to depth 2, then writes deeper ones as inline text', () => {
    const w = walk('', '[[1, [2, [3]]]]');
    expect(w.heap).toEqual({ 1: ['LIST', ['R', 2]], 2: ['LIST', '1', ['R', 3]], 3: ['LIST', '2', '[3]'] });
  });

  it("references a depth-0 object's fields, and writes a deeper object's fields as inline text", () => {
    const w = walk(
      `class Node:
    def __init__(self, k):
        self.k = k
        self.next = None
        self.f = lambda: 0
class Solution:
    def __init__(self):
        self.dp = [[0, 1]]
        self.memo = {1: [2, 3]}
        self.head = Node(1)
        self.head.next = Node(2)
        self.name = 'x' * 250
s = Solution()`,
      's',
    );
    expect(w.heap).toEqual({
      1: ['OBJ', 'Solution', [['dp', ['R', 2]], ['memo', ['R', 3]], ['head', ['R', 4]], ['name', `"${'x'.repeat(200)}"`]]],
      2: ['LIST', ['R', 5]],
      3: ['DICT', ['1', '[2, 3]']],
      4: ['OBJ', 'Node', [['k', '1'], ['next', 'Node(k=2, next=None)']]],
      5: ['LIST', '0', '1'],
    });
  });

  it('writes nested tuples, sets, dicts and objects inside containers as inline text', () => {
    const w = walk('', "[(1, 2), {5}, {'a': [1]}, ('x',)]");
    expect(w.heap[1]).toEqual(['LIST', '(1, 2)', '{5}', '{"a": […]}', '("x",)']);
  });

  it("writes an object without __dict__ as its repr, and '<…>' reprs as <ClassName>", () => {
    const w = walk('', 'lv_nodes.NestedInteger(5), range(3), iter([1])');
    expect(Object.values(w.heap)).toEqual([
      ['OBJ', 'NestedInteger', [], '5'],
      ['OBJ', 'range', [], 'range(0, 3)'],
      ['OBJ', 'list_iterator', [], '<list_iterator>'],
    ]);
  });
});

describe('cuts', () => {
  it('keeps 200 items of a container and marks the trace truncated', () => {
    const w = walk('', 'list(range(250)), {i: i for i in range(250)}');
    expect(w.heap[1]).toHaveLength(201);
    expect(w.heap[2]).toHaveLength(201);
    expect(w.truncated).toBe(true);
  });

  it('keeps 30 rows of a grid, and marks a row wider than 30 truncated', () => {
    const rows = walk('', '[[0] * 3 for _ in range(40)]');
    expect(rows.heap[1]).toHaveLength(31);
    expect(rows.truncated).toBe(true);
    const wide = walk('', '[[0] * 31]');
    expect(wide.heap[2]).toHaveLength(32);
    expect(wide.truncated).toBe(true);
    expect(walk('', '[[0] * 30 for _ in range(30)]').truncated).toBe(false);
  });

  it('cuts a string item to 99 characters plus … past 100', () => {
    const w = walk('', "['y' * 150, 'z' * 100]");
    expect(w.heap[1]).toEqual(['LIST', `"${'y'.repeat(99)}…"`, `"${'z'.repeat(100)}"`]);
    expect(w.truncated).toBe(true);
  });

  it('walks at most 200 list nodes and 127 tree nodes per step', () => {
    const w = walk('head = lv_nodes.build_list(range(300)); root = lv_nodes.build_tree(list(range(200)))', 'head, root');
    const tags = Object.values(w.heap).map((e) => e[0]);
    expect(tags.filter((t) => t === 'LNODE')).toHaveLength(200);
    expect(tags.filter((t) => t === 'TNODE')).toHaveLength(127);
    expect(w.truncated).toBe(true);
  });
});

describe('ids and change detection', () => {
  it('gives an object one id, and never reuses an id after the object dies (it is pinned)', () => {
    const out = pyJson<number[]>(py, `
rec = lv_trace.Recorder({})
a = [1]
ids = [rec.pin(a), rec.pin(a)]
for i in range(5):
    ids.append(rec.pin([i]))  # each list is garbage at once, but the pin keeps id() from being reused
json.dumps(ids)
`);
    expect(out).toEqual([1, 1, 2, 3, 4, 5, 6]);
  });

  it('reuses an unchanged entry, and re-encodes it after a change, including a change inside a row', () => {
    const out = pyJson<boolean[]>(py, `
rec = lv_trace.Recorder({})
grid = [[1, 2], [3]]
first = rec.walk([(grid, 0)])
second = rec.walk([(grid, 0)])
grid[1].append(4)
third = rec.walk([(grid, 0)])
json.dumps([first[1][1] is second[1][1], first[3][1] is second[3][1], third[1][1] is second[1][1], third[3][1] == ['LIST', '3', '4']])
`);
    expect(out).toEqual([true, true, true, true]);
  });

  it('marks the trace truncated when a reused container later grows past a cap', () => {
    const out = pyJson<boolean[]>(py, `
def grown(setup, grow):
    ns = {}
    exec(setup, ns)
    rec = lv_trace.Recorder({})
    rec.walk([(ns['a'], 0)])
    before = rec.truncated
    exec(grow, ns)
    rec.walk([(ns['a'], 0)])
    return [before, rec.truncated]
json.dumps(
    grown('a = list(range(200))', 'a.append(999)')
    + grown('a = {i: i for i in range(200)}', 'a[999] = 1')
    + grown('a = [[0] * 3]', 'a[0].extend([0] * 30)')
    + grown('a = type("O", (), {})(); a.__dict__.update({str(i): i for i in range(200)})', 'a.extra = 1')\n)
`);
    expect(out).toEqual([false, true, false, true, false, true, false, true]);
  });

  it('re-encodes a container holding inline text of a mutable object on every walk', () => {
    const out = pyJson<unknown[]>(py, `
rec = lv_trace.Recorder({})
rows = [set(), set()]
before = rec.walk([(rows, 0)])[1][1]
rows[0].add(9)
after = rec.walk([(rows, 0)])[1][1]
json.dumps([before, after])
`);
    expect(out).toEqual([
      ['LIST', 'set()', 'set()'],
      ['LIST', '{9}', 'set()'],
    ]);
  });
});

describe('inline text', () => {
  it.each([
    ['[1, [2], (3,)]', '[1, […], (…)]'],
    ['(1,)', '(1,)'],
    ['()', '()'],
    ['{}', '{}'],
    ["{'a': [1]}", '{"a": […]}'],
    ['set()', 'set()'],
    ['frozenset()', 'set()'],
    ['{1}', '{1}'],
    ['deque([1])', 'deque([1])'],
    ['deque()', 'deque([])'],
    ['[[]]', '[[]]'],
    ['lv_nodes.ListNode(3)', 'ListNode(3)'],
    ["lv_nodes.TreeNode('x')", 'TreeNode("x")'],
    ['SortedList([2, 1])', '[1, 2]'],
  ])('writes %s as %s', (expr, want) => {
    expect(text(expr)).toBe(want);
  });

  it('writes an object as Cls(field=…) with at most four fields, skipping callables', () => {
    py.runPython(`
class P:
    def __init__(self): self.val = 1; self.neighbors = [2]; self.f = lambda: 0
class Big:
    def __init__(self): self.a = 1; self.b = 2; self.c = 3; self.d = 4; self.e = 5
class Empty:
    pass
`);
    expect([text('P()'), text('Big()'), text('Empty()'), text('[P()]')]).toEqual([
      'P(val=1, neighbors=[…])',
      'Big(a=1, b=2, c=3, d=4, …)',
      'Empty()',
      '[P(…)]',
    ]);
  });

  it('cuts a long text to 99 characters plus …', () => {
    const t = text('list(range(100))');
    expect(t).toHaveLength(100);
    expect(t.endsWith('…')).toBe(true);
    expect(t.startsWith('[0, 1, 2, 3')).toBe(true);
  });

  it('hides callables and modules', () => {
    expect(pyJson(py, `import math\njson.dumps([lv_trace.hidden(x) for x in (len, math, print, lv_nodes.ListNode, lambda: 0, (lambda: 0).__call__, 1, [len])])`)).toEqual([
      true, true, true, true, true, true, false, false,
    ]);
  });
});
