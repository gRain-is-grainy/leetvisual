import type { PyodideAPI } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Meta } from '../../../src/shared/messages';
import { listItems, listVals, loadHarness, runJob } from '../../helpers/py';

let py: PyodideAPI;
beforeAll(async () => {
  py = await loadHarness();
}, 60_000);

const TWO_SUM_META: Meta = {
  name: 'twoSum',
  params: [{ name: 'nums', type: 'integer[]' }, { name: 'target', type: 'integer' }],
  return: { type: 'integer[]' },
};
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
            prev = curr
            curr = nxt
        return prev
`;
const REVERSE_META: Meta = { name: 'reverseList', params: [{ name: 'head', type: 'ListNode' }], return: { type: 'ListNode' } };
const F_META: Meta = { name: 'f', params: [{ name: 'n', type: 'integer' }] };

describe('function problems', () => {
  it('calls Solution().<name>(*args) with arguments built from metaData and returns the raw trace', () => {
    const t = runJob(py, { code: TWO_SUM, slug: 'two-sum', meta: TWO_SUM_META, inputs: ['[2,7,11,15]', '9'] });
    expect(t).toMatchObject({ v: 1, keyEvery: 1000, outputs: null, truncated: false });
    expect(t.facts['Solution.twoSum']).toEqual({ cursors: [['nums', 'i'], ['seen', 'n']], grids: [], strs: ['seen'] });
    expect(t.entry).toEqual({ lists: [], trees: [], args: [['R', 2], '9'] });
    expect(t.steps).toHaveLength(9);
    expect(t.end).toEqual({ kind: 'return', value: ['R', 4] });
    expect(listItems(t, t.end.kind === 'return' ? t.end.value : undefined)).toEqual(['0', '1']);
  });

  it('names node-typed entry parameters for the pools', () => {
    const merge = runJob(py, {
      code: 'class Solution:\n    def mergeTwoLists(self, list1, list2):\n        return list1\n',
      meta: { name: 'mergeTwoLists', params: [{ name: 'list1', type: 'ListNode' }, { name: 'list2', type: 'ListNode' }] },
      inputs: ['[1,2,4]', '[]'],
    });
    expect(merge.entry.lists).toEqual(['list1']);
    const k = runJob(py, {
      code: 'class Solution:\n    def mergeKLists(self, lists):\n        return None\n',
      meta: { name: 'mergeKLists', params: [{ name: 'lists', type: 'ListNode[]' }] },
      inputs: ['[[1,4],[2]]'],
    });
    expect(k.entry.lists).toEqual(['lists']);
    const tree = runJob(py, {
      code: 'class Solution:\n    def maxDepth(self, root):\n        return 0\n',
      meta: { name: 'maxDepth', params: [{ name: 'root', type: 'TreeNode' }] },
      inputs: ['[3,9,20,null,null,15,7]'],
    });
    expect(tree.entry.trees).toEqual(['root']);
  });

  it('builds arguments from type hints when there is no metaData', () => {
    const t = runJob(py, { code: REVERSE, inputs: ['[1,2,3,4]'] });
    expect(t.entry.lists).toEqual(['head']);
    expect(listVals(t, t.end.kind === 'return' ? t.end.value : undefined)).toEqual(['4', '3', '2', '1']);
    const union = runJob(py, { code: REVERSE.replace(/Optional\[ListNode\]/g, 'ListNode | None'), inputs: ['[1,2]'] });
    expect(listVals(union, union.end.kind === 'return' ? union.end.value : undefined)).toEqual(['2', '1']);
  });

  it('passes plain JSON values without metaData or hints', () => {
    const t = runJob(py, { code: 'class Solution:\n    def f(self, a, b):\n        return a + b\n', inputs: ['[1]', '[2]'] });
    expect(listItems(t, t.end.kind === 'return' ? t.end.value : undefined)).toEqual(['1', '2']);
  });

  it('ends a void entry without a value, from metaData or a "-> None" hint', () => {
    const code = 'class Solution:\n    def rotate(self, nums) -> None:\n        nums.reverse()\n';
    expect(runJob(py, { code, meta: { name: 'rotate', params: [{ name: 'nums', type: 'integer[]' }], return: { type: 'void' } }, inputs: ['[1,2]'] }).end).toEqual({ kind: 'return' });
    expect(runJob(py, { code, inputs: ['[1,2]'] }).end).toEqual({ kind: 'return' });
  });

  it("falls through a manual problem whose signature matches metaData's parameters", () => {
    const t = runJob(py, {
      code: 'class Solution:\n    def numIslands(self, grid):\n        return len(grid)\n',
      slug: 'number-of-islands',
      meta: { name: 'numIslands', params: [{ name: 'grid', type: 'character[][]' }], manual: true },
      inputs: ['[["1"]]'],
    });
    expect(t.end).toEqual({ kind: 'return', value: '1' });
  });

  it('respects the job caps', () => {
    const t = runJob(py, { code: 'class Solution:\n    def f(self, n):\n        while True:\n            n += 1\n', meta: F_META, inputs: ['0'], caps: { steps: 50, ms: 3000, bytes: 5_000_000 } });
    expect(t.end).toEqual({ kind: 'cap', cap: 'steps' });
    expect(t.steps).toHaveLength(50);
  });
});

describe('ends without steps', () => {
  it('reports a SyntaxError with its line and column', () => {
    const t = runJob(py, { code: 'class Solution:\n    def f(self):\n        return (\n', meta: F_META, inputs: ['1'] });
    expect(t.steps).toEqual([]);
    expect(t.end).toEqual({ kind: 'syntax', msg: "'(' was never closed", line: 3, col: 16 });
  });

  it('reports a malformed or missing input by parameter name', () => {
    expect(runJob(py, { code: TWO_SUM, meta: TWO_SUM_META, inputs: ['[2,7', '9'] }).end).toEqual({ kind: 'input', param: 'nums' });
    expect(runJob(py, { code: TWO_SUM, meta: TWO_SUM_META, inputs: ['[2,7]'] }).end).toEqual({ kind: 'input', param: 'target' });
    expect(runJob(py, { code: TWO_SUM, meta: TWO_SUM_META, inputs: ['"x"', '9'] }).end).toEqual({ kind: 'input', param: 'nums' });
  });

  it("reports a manual problem whose signature doesn't match as unsupported", () => {
    const t = runJob(py, {
      code: 'class Solution:\n    def hasCycle(self, head):\n        return False\n',
      slug: 'not-in-the-table',
      meta: { name: 'hasCycle', params: [{ name: 'head', type: 'ListNode' }, { name: 'pos', type: 'integer' }], manual: true },
      inputs: ['[1]', '0'],
    });
    expect(t.end).toEqual({ kind: 'unsupported' });
  });

  it('reports no Solution class without metaData as unsupported', () => {
    expect(runJob(py, { code: 'def f(x):\n    return x\n', inputs: ['1'] }).end).toEqual({ kind: 'unsupported' });
  });

  it("reports an exception in the module body with its line, and a missing entry with line 0", () => {
    expect(runJob(py, { code: 'import nosuchmod\nclass Solution:\n    pass\n', meta: F_META, inputs: ['1'] }).end).toEqual({
      kind: 'exception', type: 'ModuleNotFoundError', msg: "No module named 'nosuchmod'", line: 1,
    });
    expect(runJob(py, { code: 'class Solution:\n    pass\n', meta: F_META, inputs: ['1'] }).end).toEqual({
      kind: 'exception', type: 'AttributeError', msg: "'Solution' object has no attribute 'f'", line: 0,
    });
    expect(runJob(py, { code: 'x = 1\n', meta: F_META, inputs: ['1'] }).end).toEqual({
      kind: 'exception', type: 'NameError', msg: "name 'Solution' is not defined", line: 0,
    });
  });
});

describe('exceptions', () => {
  it('keeps the steps up to the raise, ending with the exception step and its line', () => {
    const t = runJob(py, {
      code: 'class Solution:\n    def twoSum(self, nums, target):\n        for i in range(len(nums) + 1):\n            if nums[i] + nums[i] == target * 100:\n                return [i, i]\n',
      meta: TWO_SUM_META,
      inputs: ['[2,7]', '9'],
    });
    expect(t.end).toEqual({ kind: 'exception', type: 'IndexError', msg: 'list index out of range', line: 4 });
    expect(t.steps.at(-1)).toMatchObject({ line: 4, ev: 'exception', exc: ['IndexError', 'list index out of range'] });
  });
});

describe('design problems', () => {
  const LRU_META: Meta = {
    classname: 'LRUCache',
    constructor: { params: [{ type: 'integer', name: 'capacity' }] },
    methods: [
      { name: 'get', params: [{ type: 'integer', name: 'key' }], return: { type: 'integer' } },
      { name: 'put', params: [{ type: 'integer', name: 'key' }, { type: 'integer', name: 'value' }], return: { type: 'void' } },
    ],
    systemdesign: true,
    params: [{ name: 'inputs', type: 'integer[]' }, { name: 'inputs', type: 'integer[]' }],
    return: { type: 'list<String>' },
  };
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

  it('replays the calls and records each return for the output card, in order, at the step it returned', () => {
    const t = runJob(py, {
      code: LRU,
      slug: 'lru-cache',
      meta: LRU_META,
      inputs: ['["LRUCache","put","put","get","put","get","put","get","get","get"]', '[[2],[1,1],[2,2],[1],[3,3],[2],[4,4],[1],[3],[4]]'],
    });
    expect(t.end).toEqual({ kind: 'return' });
    expect(t.entry).toEqual({ lists: [], trees: [], args: [] });
    expect(t.outputs!.map((o) => o.v)).toEqual(['None', 'None', 'None', '1', 'None', '-1', 'None', '-1', '3', '4']);
    const at = t.outputs!.map((o) => o.at);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(t.steps[at[3]].ev).toBe('return');
    expect(at[9]).toBe(t.steps.length - 1);
  });

  it('drops *Size constructor parameters and treats [null] as no arguments', () => {
    const t = runJob(py, {
      code: 'class NumArray:\n    def __init__(self, nums):\n        self.nums = nums\n    def total(self):\n        return sum(self.nums)\n',
      meta: {
        classname: 'NumArray',
        constructor: { params: [{ name: 'nums', type: 'integer[]' }, { name: 'numsSize', type: 'integer' }] },
        methods: [{ name: 'total', params: [], return: { type: 'integer' } }],
        params: [{ name: 'inputs', type: 'integer[]' }, { name: 'inputs', type: 'integer[]' }],
      },
      inputs: ['["NumArray","total","total"]', '[[[1,2,3]],[],[null]]'],
    });
    expect(t.outputs!.map((o) => o.v)).toEqual(['None', '6', '6']);
  });

  it('reports mismatched design inputs as an input error', () => {
    expect(runJob(py, { code: LRU, meta: LRU_META, inputs: ['["LRUCache","get"]', '[[2]]'] }).end).toEqual({ kind: 'input', param: 'inputs' });
  });
});

describe('between runs', () => {
  it('starts each run in a fresh namespace with the default recursion limit', () => {
    runJob(py, { code: 'import sys\nsys.setrecursionlimit(50)\nleak = 1\nclass Solution:\n    def f(self, n):\n        return n\n', meta: F_META, inputs: ['1'] });
    const t = runJob(py, { code: 'import sys\nclass Solution:\n    def f(self, n):\n        return [sys.getrecursionlimit(), "leak" in globals()]\n', meta: F_META, inputs: ['1'] });
    expect(listItems(t, t.end.kind === 'return' ? t.end.value : undefined)).toEqual(['1000', 'False']);
  });

  it('traces a 50,000-node list to a cap, frees it without a crash, and runs the next job', () => {
    const big = `[${Array.from({ length: 50_000 }, (_, i) => i).join(',')}]`;
    const t = runJob(py, { code: REVERSE, meta: REVERSE_META, inputs: [big] });
    expect(t.end.kind).toBe('cap');
    expect(t.truncated).toBe(true);
    expect(runJob(py, { code: TWO_SUM, meta: TWO_SUM_META, inputs: ['[3,3]', '6'] }).end.kind).toBe('return');
  }, 30_000);
});

// Review Focus
describe('hostile inputs', () => {
  // The limit is hit inside the trace function on the call event, so the line is the def line of the frame being entered.
  it('ends runaway recursion as a RecursionError at the function it recursed into, and traces the next run', () => {
    const t = runJob(py, { code: 'class Solution:\n    def f(self, n):\n        return self.f(n + 1)\n', meta: F_META, inputs: ['0'] });
    expect(t.end).toMatchObject({ kind: 'exception', type: 'RecursionError', line: 2 });
    expect(t.steps.length).toBeGreaterThan(100);
    expect(runJob(py, { code: TWO_SUM, meta: TWO_SUM_META, inputs: ['[3,3]', '6'] }).steps).toHaveLength(9);
  }, 30_000);

  it('ends a SystemExit from exit() as an exception, not a harness failure', () => {
    expect(runJob(py, { code: 'class Solution:\n    def f(self, n):\n        exit(3)\n', meta: F_META, inputs: ['1'] }).end).toMatchObject({ kind: 'exception', type: 'SystemExit', line: 3 });
  });

  it('keeps unicode exact and survives a lone surrogate in a string input', () => {
    const code = 'class Solution:\n    def f(self, s):\n        return s\n';
    const meta: Meta = { name: 'f', params: [{ name: 's', type: 'string' }] };
    expect(runJob(py, { code, meta, inputs: ['"é😀"'] }).end).toEqual({ kind: 'return', value: '"é😀"' });
    expect(runJob(py, { code, meta, inputs: ['"\\ud800"'] }).end).toEqual({ kind: 'return', value: '"\ud800"' });
  });

  it("still builds the harness's nodes when the solution defines its own ListNode", () => {
    const t = runJob(py, {
      code: 'class ListNode:\n    def __init__(self, val=0, next=None):\n        self.val = val\n        self.next = next\nclass Solution:\n    def reverseList(self, head):\n        return ListNode(head.val)\n',
      meta: REVERSE_META,
      inputs: ['[1,2]'],
    });
    expect(t.entry.lists).toEqual(['head']);
    expect(t.end.kind).toBe('return');
  });

  it('ends a NestedInteger input nested past the recursion limit as an input error', () => {
    const t = runJob(py, { code: 'class Solution:\n    def f(self, n):\n        return n\n', meta: { name: 'f', params: [{ name: 'n', type: 'NestedInteger' }] }, inputs: ['['.repeat(1500) + ']'.repeat(1500)] });
    expect(t.steps).toEqual([]);
    expect(t.end).toEqual({ kind: 'input', param: 'n' });
  });

  it('ends a double input too large for a float as an input error', () => {
    const t = runJob(py, { code: 'class Solution:\n    def f(self, x):\n        return x\n', meta: { name: 'f', params: [{ name: 'x', type: 'double' }] }, inputs: ['1' + '0'.repeat(400)] });
    expect(t.steps).toEqual([]);
    expect(t.end).toEqual({ kind: 'input', param: 'x' });
  });

  it('ends exit() in Solution.__init__ as an exception, not a harness failure', () => {
    const t = runJob(py, { code: 'class Solution:\n    def __init__(self):\n        exit(3)\n    def f(self, n):\n        return n\n', meta: F_META, inputs: ['1'] });
    expect(t.end).toMatchObject({ kind: 'exception', type: 'SystemExit' });
  });

it('runs a generator in the user code with a consistent stack', () => {
    const t = runJob(py, {
      code: 'class Solution:\n    def f(self, n):\n        def gen():\n            for i in range(n):\n                yield i\n        return sum(gen())\n',
      meta: F_META,
      inputs: ['3'],
    });
    expect(t.end).toEqual({ kind: 'return', value: '3' });
    expect(t.steps.filter((s) => s.ev === 'call')).toHaveLength(t.steps.filter((s) => s.ev === 'return').length);
    expect(Math.max(...t.steps.map((s) => s.depth))).toBe(2);
  });
});
