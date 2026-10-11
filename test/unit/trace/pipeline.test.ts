import type { PyodideAPI } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ArrayS, CallsS, GridS, ListS, MapS, Structure, TreeS, VarS } from '../../../src/panel/model/types';
import { buildSteps } from '../../../src/panel/trace/steps';
import type { Step, TraceResult } from '../../../src/panel/trace/types';
import type { Meta } from '../../../src/shared/messages';
import { loadHarness, runJob } from '../../helpers/py';

let py: PyodideAPI;
beforeAll(async () => {
  py = await loadHarness();
}, 60_000);

const traceOf = (code: string, slug: string, meta: Meta | null, inputs: string[]): TraceResult =>
  buildSteps(runJob(py, { code, slug, meta, inputs }), code);
const card = <S extends Structure>(s: Step, id: string) => s.board.structs[id] as S | undefined;
const last = (r: TraceResult) => r.steps[r.steps.length - 1];

const TWO_SUM = `class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        seen = {}
        for i, n in enumerate(nums):
            if target - n in seen:
                return [seen[target - n], i]
            seen[n] = i
`;

const REVERSE = `class Solution:
    def reverseList(self, head: Optional[ListNode]) -> Optional[ListNode]:
        prev, curr = None, head
        while curr:
            nxt = curr.next
            curr.next = prev
            prev, curr = curr, nxt
        return prev
`;

const ISLANDS = `class Solution:
    def numIslands(self, grid: List[List[str]]) -> int:
        rows, cols = len(grid), len(grid[0])
        count = 0

        def dfs(r, c):
            if r < 0 or c < 0 or r >= rows or c >= cols or grid[r][c] != "1":
                return
            grid[r][c] = "0"
            dfs(r + 1, c)
            dfs(r - 1, c)
            dfs(r, c + 1)
            dfs(r, c - 1)

        for r in range(rows):
            for c in range(cols):
                if grid[r][c] == "1":
                    dfs(r, c)
                    count += 1
        return count
`;

const MAX_DEPTH = `class Solution:
    def maxDepth(self, root: Optional[TreeNode]) -> int:
        if not root:
            return 0
        return 1 + max(self.maxDepth(root.left), self.maxDepth(root.right))
`;

const LRU = `class LRUCache:
    def __init__(self, capacity: int):
        self.cap = capacity
        self.cache = OrderedDict()

    def get(self, key: int) -> int:
        if key not in self.cache:
            return -1
        self.cache.move_to_end(key)
        return self.cache[key]

    def put(self, key: int, value: int) -> None:
        self.cache[key] = value
        self.cache.move_to_end(key)
        if len(self.cache) > self.cap:
            self.cache.popitem(last=False)
`;

const LRU_META: Meta = {
  classname: 'LRUCache',
  constructor: { params: [{ type: 'integer', name: 'capacity' }] },
  methods: [
    { name: 'get', params: [{ type: 'integer', name: 'key' }], return: { type: 'integer' } },
    { name: 'put', params: [{ type: 'integer', name: 'key' }, { type: 'integer', name: 'value' }], return: { type: 'void' } },
  ],
  systemdesign: true,
  params: [
    { name: 'inputs', type: 'integer[]' },
    { name: 'inputs', type: 'integer[]' },
  ],
  return: { type: 'list<String>' },
};

describe('harness → buildSteps', () => {
  it('Two Sum: nums with an i cursor, target, a seen map and a return card', () => {
    const r = traceOf(
      TWO_SUM,
      'two-sum',
      { name: 'twoSum', params: [{ name: 'nums', type: 'integer[]' }, { name: 'target', type: 'integer' }], return: { type: 'integer[]' } },
      ['[2,7,11,15]', '9'],
    );
    expect(r.end).toEqual({ kind: 'return', value: '[0, 1]' });
    expect(r.truncated).toBe(false);
    expect(r.steps[0]).toMatchObject({ ev: 'call', fn: 'twoSum', line: 2, depth: 1 });
    expect(card<VarS>(r.steps[0], 't:target')).toMatchObject({ kind: 'var', value: '9' });
    expect(r.steps.some((s) => card<ArrayS>(s, 't:nums')?.ptrs.some((p) => p.name === 'i' && p.at === 0))).toBe(true);
    expect(r.steps.every((s) => !card(s, 't:i') && !card(s, 't:self'))).toBe(true);
    expect(card<MapS>(last(r), 't:seen')).toMatchObject({ kind: 'map', entries: [['2', '0']] });
    expect(card<ArrayS>(last(r), 't:#return')).toMatchObject({ kind: 'array', items: ['0', '1'] });
    expect(last(r)).toMatchObject({ ev: 'return', detail: '[0, 1]' });
  });

  it('Reverse Linked List: one head pool on every step, null pointers, and the returned node as a pointer', () => {
    const r = traceOf(REVERSE, 'reverse-linked-list', { name: 'reverseList', params: [{ name: 'head', type: 'ListNode' }], return: { type: 'ListNode' } }, [
      '[1,2,3]',
    ]);
    expect(r.end).toEqual({ kind: 'return', value: 'ListNode(3)' });
    for (const s of r.steps) {
      const pool = card<ListS>(s, 't:#list')!;
      expect(pool.name).toBe('head');
      expect(Object.keys(pool.nodes)).toHaveLength(3);
    }
    expect(r.steps.some((s) => card<ListS>(s, 't:#list')!.ptrs.some((p) => p.name === 'prev' && p.at === null))).toBe(true);
    const end = card<ListS>(last(r), 't:#list')!;
    const three = Object.entries(end.nodes).find(([, n]) => n.val === '3')![0];
    const one = Object.entries(end.nodes).find(([, n]) => n.val === '1')![0];
    expect(end.ptrs).toEqual([
      { name: 'head', at: one },
      { name: 'prev', at: three },
      { name: 'curr', at: null },
      { name: 'nxt', at: null },
      { name: 'return', at: three },
    ]);
    expect(card(last(r), 't:#return')).toBeUndefined();
    expect(r.steps.every((s) => !card(s, 't:prev') && !card(s, 't:curr'))).toBe(true);
  });

  it('Number of Islands: a grid with an r,c chip in the nested dfs, the call stack card and the count', () => {
    const r = traceOf(
      ISLANDS,
      'number-of-islands',
      { name: 'numIslands', params: [{ name: 'grid', type: 'character[][]' }], return: { type: 'integer' }, manual: true },
      ['[["1","1","0"],["0","1","0"],["0","0","1"]]'],
    );
    expect(r.end).toEqual({ kind: 'return', value: '2' });
    const inDfs = r.steps.find((s) => s.fn === 'dfs' && s.ev === 'line')!;
    expect(card<GridS>(inDfs, 't:grid')!.kind).toBe('grid');
    expect(card<GridS>(inDfs, 't:grid')!.ptrs.map((p) => p.name)).toEqual(['r,c']);
    expect(card(inDfs, 't:r')).toBeUndefined();
    expect(card(inDfs, 't:dfs')).toBeUndefined();
    expect(card<VarS>(inDfs, 't:rows')).toMatchObject({ kind: 'var', value: '3' });
    expect(card<CallsS>(inDfs, 't:#calls')!.frames.map((f) => f.fn)).toEqual(['numIslands', 'dfs']);
    expect(card<CallsS>(r.steps[0], 't:#calls')!.frames.map((f) => f.fn)).toEqual(['numIslands']);
    expect(r.steps.some((s) => card<GridS>(s, 't:grid')?.ptrs.some((p) => Array.isArray(p.at) && p.at[0] === -1))).toBe(true);
    expect(card<VarS>(last(r), 't:#return')).toMatchObject({ kind: 'var', value: '2' });
    expect(card<GridS>(last(r), 't:grid')!.rows.flat().every((v) => v === '"0"')).toBe(true);
  });

  it('Maximum Depth: the whole tree stays in one root pool while the recursion reaches a leaf and None', () => {
    const r = traceOf(
      MAX_DEPTH,
      'maximum-depth-of-binary-tree',
      { name: 'maxDepth', params: [{ name: 'root', type: 'TreeNode' }], return: { type: 'integer' } },
      ['[3,9,20,null,null,15,7]'],
    );
    expect(r.end).toEqual({ kind: 'return', value: '3' });
    for (const s of r.steps) expect(Object.keys(card<TreeS>(s, 't:#tree')!.nodes)).toHaveLength(5);
    expect(card<TreeS>(r.steps[0], 't:#tree')!.name).toBe('root');
    expect(r.steps.some((s) => s.depth >= 3 && card<TreeS>(s, 't:#tree')!.ptrs.some((p) => p.name === 'root' && p.at === null))).toBe(true);
    expect(Math.max(...r.steps.map((s) => card<CallsS>(s, 't:#calls')!.frames.length))).toBe(4);
    expect(card<VarS>(last(r), 't:#return')).toMatchObject({ kind: 'var', value: '3' });
  });

  it('LRU Cache: self fields as cards and an output card that fills in as calls return', () => {
    const r = traceOf(LRU, 'lru-cache', LRU_META, [
      '["LRUCache","put","put","get","put","get","put","get","get","get"]',
      '[[2],[1,1],[2,2],[1],[3,3],[2],[4,4],[1],[3],[4]]',
    ]);
    expect(r.end).toEqual({ kind: 'return' });
    expect(card<ArrayS>(r.steps[0], 't:#output')!.items).toEqual([]);
    expect(card<ArrayS>(last(r), 't:#output')!.items).toEqual(['None', 'None', 'None', '1', 'None', '-1', 'None', '-1', '3', '4']);
    const put = r.steps.find((s) => s.fn === 'put' && card(s, 't:self.cache'))!;
    expect(card<VarS>(put, 't:self.cap')).toMatchObject({ kind: 'var', value: '2' });
    expect(card(put, 't:self.cache')!.kind).toBe('map');
    expect(card(put, 't:self')).toBeUndefined();
    expect(card<VarS>(put, 't:key')!.kind).toBe('var');
    expect(card(put, 't:#return')).toBeUndefined();
  });
});
