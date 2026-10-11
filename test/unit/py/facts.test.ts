import type { PyodideAPI } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import type { RFacts } from '../../../src/panel/trace/raw';
import { loadHarness, pyJson } from '../../helpers/py';

let py: PyodideAPI;
beforeAll(async () => {
  py = await loadHarness();
}, 60_000);

const facts = (src: string) => pyJson<Record<string, RFacts>>(py, `import ast, json, lv_facts\njson.dumps(lv_facts.facts(ast.parse(${JSON.stringify(src)})))`);
const method = (src: string, name: string | null) =>
  pyJson(py, `import ast, json, lv_args, lv_facts
m = lv_facts.method(ast.parse(${JSON.stringify(src)}), 'Solution', ${name === null ? 'None' : JSON.stringify(name)})
json.dumps(None if m is None else [m[0], m[1], [lv_args.hint_type(h) for h in m[2]], lv_args.is_void(m[3])])`);

describe('cursor facts', () => {
  it('binds a[i], a[i + 1], a[i - 1], a[1 + i] and enumerate to their container', () => {
    const f = facts(`
def f(a, b, s):
    for j, x in enumerate(a):
        pass
    return a[i] + a[k + 1] + b[m - 1] + b[1 + n] + a[0] + a[i * 2]
`).f;
    expect(f.cursors).toEqual([['a', 'j'], ['a', 'i'], ['a', 'k'], ['b', 'm'], ['b', 'n']]);
    expect(f.grids).toEqual([]);
  });

  it('does not bind enumerate(a, start), whose index is offset', () => {
    expect(facts('def f(a):\n    for i, x in enumerate(a, 1):\n        pass\n').f.cursors).toEqual([]);
  });

  it('binds g[r][c] as a pair, with an offset on either index', () => {
    const f = facts('def f(g, r, c):\n    return g[r][c] + g[r + 1][c - 1] + g[0][c]\n').f;
    expect(f.grids).toEqual([['g', 'r', 'c']]);
    expect(f.cursors).toEqual([['g', 'r']]);
  });

  it('treats self.<attr> as a container', () => {
    const m = facts('class S:\n    def f(self, i):\n        self.dp[i] = self.word[i - 1]\n')['S.f'];
    expect(m.cursors).toEqual([['self.dp', 'i'], ['self.word', 'i']]);
    expect(m.strs).toEqual(['self.dp', 'self.word']);
  });

  it('records every subscripted name, slices too, so a subscripted str becomes a character array', () => {
    expect(facts('def f(s, t, d):\n    return s[1:] + t[::-1] + d["k"]\n').f.strs).toEqual(['s', 't', 'd']);
  });

  it('never binds a name assigned only once, from len(...), including in a tuple unpacking', () => {
    const f = facts(`
def f(grid, nums):
    ROWS = len(grid)
    rows, cols = len(grid), len(grid[0])
    n = len(nums)
    m = len(nums)
    m = m - 1
    return grid[ROWS] + grid[rows][cols] + nums[n] + nums[m]
`).f;
    // m is assigned twice, so it still binds.
    expect(f.cursors).toEqual([['nums', 'm']]);
    expect(f.grids).toEqual([]);
  });

  it('keys nested functions by qualified name and keeps lambda bodies, annotations and defaults out', () => {
    const all = facts(`
class Solution:
    def numIslands(self, grid: List[List[str]], k: int = d[0]) -> int:
        def dfs(r, c):
            grid[r][c] = "0"
        key = lambda z: grid[z]
        squares = [grid[i] for i in range(3)]
        return 0
def helper(a, i):
    return a[i]
`);
    expect(Object.keys(all)).toEqual(['Solution.numIslands', 'Solution.numIslands.<locals>.dfs', 'helper']);
    expect(all['Solution.numIslands']).toEqual({ cursors: [['grid', 'i']], grids: [], strs: ['grid'] });
    expect(all['Solution.numIslands.<locals>.dfs']).toEqual({ cursors: [['grid', 'r']], grids: [['grid', 'r', 'c']], strs: ['grid'] });
    expect(all.helper.cursors).toEqual([['a', 'i']]);
  });

  it('matches co_qualname for methods, nested functions and classes inside functions', () => {
    const out = pyJson<[string[], string[]]>(py, `
import ast, json, lv_facts
src = '''
class Solution:
    def f(self):
        def g():
            class C:
                def h(self):
                    return 1
            return C().h()
        return g()
'''
names = sorted(lv_facts.facts(ast.parse(src)))
seen = []
def tracer(frame, ev, arg):
    if frame.f_code.co_filename == '<t>' and frame.f_code.co_qualname not in seen:
        seen.append(frame.f_code.co_qualname)
import sys
g = {}
exec(compile(src, '<t>', 'exec'), g)
sys.setprofile(tracer)
g['Solution']().f()
sys.setprofile(None)
json.dumps([names, sorted(n for n in seen if n != 'Solution.f.<locals>.g.<locals>.C')])
`);
    expect(out[0]).toEqual(out[1]);
  });
});

describe('method', () => {
  const SRC = `
class Solution:
    def __init__(self):
        pass
    def _helper(self, x):
        pass
    def twoSum(self, nums: list[int], target: int) -> list[int]:
        pass
    def reverseList(self, head: ListNode | None) -> None:
        pass
`;
  it('finds a method by name and returns its parameters without self, their hints and void', () => {
    expect(method(SRC, 'reverseList')).toEqual(['reverseList', ['head'], ['ListNode'], true]);
  });

  it('takes the first public method when no name is given', () => {
    expect(method(SRC, null)).toEqual(['twoSum', ['nums', 'target'], ['integer[]', 'integer'], false]);
  });

  it('returns None without the class or the method', () => {
    expect([method(SRC, 'missing'), method('class Other:\n    def f(self): pass\n', null)]).toEqual([null, null]);
  });
});
