import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { PyodideAPI } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { WHEEL } from '../../../src/panel/runner/install';
import { DEFAULT_CAPS } from '../../../src/panel/trace/raw';
import { loadHarness, pyJson } from '../../helpers/py';

let py: PyodideAPI;
beforeAll(async () => {
  py = await loadHarness();
}, 60_000);

// Runs code in a fresh run namespace and returns json.dumps(out).
const inPrelude = (code: string) =>
  pyJson(py, `import json, lv_harness\ng = lv_harness.fresh_globals()\nexec(${JSON.stringify(code)}, g)\njson.dumps(g['out'])`);

describe('the vendored wheel', () => {
  it("is Pyodide 314.0.7's sortedcontainers build", () => {
    const lock = JSON.parse(readFileSync('node_modules/pyodide/pyodide-lock.json', 'utf8'));
    const sha = createHash('sha256').update(readFileSync(`vendor/${WHEEL}`)).digest('hex');
    expect(sha).toBe(lock.packages.sortedcontainers.sha256);
    expect(sha).toBe('48fd2a467d25069008ff7195db0ed1767d9bad14d1d45e54cfbe95d26ff3b596');
  });
});

describe('DEFAULT_CAPS', () => {
  it('is 10,000 steps, 3 s and 5,000,000 characters', () => {
    expect(DEFAULT_CAPS).toEqual({ steps: 10_000, ms: 3_000, bytes: 5_000_000 });
  });
});

describe('prelude', () => {
  it('runs code that uses the names LeetCode imports, without importing them', () => {
    const out = inPrelude(`
q = deque([1, 2]); q.appendleft(0)
@cache
def fib(n): return n if n < 2 else fib(n - 1) + fib(n - 2)
h = [5, 1, 3]; heapify(h)
xs: List[int] = [1, 2, 4]
o: Optional[int] = None
out = [list(q), fib(20), heappop(h), bisect_left(xs, 3), list(SortedList([3, 1, 2])), list(SortedDict({2: 'b', 1: 'a'})),
       list(SortedSet([2, 1, 2])), Counter('aab')['a'], defaultdict(int)['x'], list(accumulate([1, 2, 3])),
       reduce(lambda a, b: a * b, [2, 3]), gcd(12, 18), inf > 10**18, comb(5, 2), isqrt(17), math.ceil(2.1),
       heapq.nlargest(1, [1, 9]), array.array('i', [1, 2]).tolist(), ascii_lowercase[:3], re.sub('a', 'b', 'aa'),
       deepcopy([[2]]), ListNode(1).val, TreeNode(2).val, NestedInteger(3).getInteger()]
`);
    expect(out).toEqual([
      [0, 1, 2], 6765, 1, 2, [1, 2, 3], [1, 2], [1, 2], 2, 0, [1, 3, 6], 6, 6, true, 10, 4, 3, [9], [1, 2], 'abc', 'bb', [[2]], 1, 2, 3,
    ]);
  });

  it('keeps LeetCode\'s shadowing order: builtins win over math and operator, modules win over their own names', () => {
    const out = inPrelude(`out = [pow(2, 3, 5), abs(-2), type(copy).__name__, type(datetime).__name__, type(random).__name__, compile('1', 'x', 'eval').co_filename]`);
    expect(out).toEqual([3, 2, 'module', 'module', 'module', 'x']);
  });

  it('gives every run a new namespace', () => {
    const out = pyJson(py, `import json, lv_harness\na = lv_harness.fresh_globals()\na['leak'] = 1\njson.dumps(['leak' in lv_harness.fresh_globals(), 'deque' in a])`);
    expect(out).toEqual([false, true]);
  });
});

describe('lv_nodes', () => {
  it('builds lists and level-order trees, skipping the children of gaps', () => {
    const out = pyJson(py, `
import json, lv_nodes
def level(root):
    out, q = [], [root]
    while q:
        n = q.pop(0)
        out.append(None if n is None else n.val)
        if n is not None: q += [n.left, n.right]
    while out and out[-1] is None: out.pop()
    return out
json.dumps([[n.val for n in lv_nodes.chain(lv_nodes.build_list([1, 2, 3]))], lv_nodes.build_list([]),
            level(lv_nodes.build_tree([1, None, 2, 3])), level(lv_nodes.build_tree([5, 4, 8, None, None, 13, 4])),
            lv_nodes.build_tree([]), lv_nodes.build_tree([None])])
`);
    expect(out).toEqual([[1, 2, 3], null, [1, null, 2, 3], [5, 4, 8, null, null, 13, 4], null, null]);
  });

  it('finds the first node with a value in level order', () => {
    const out = pyJson(py, `
import json, lv_nodes
root = lv_nodes.build_tree([3, 5, 1, 6, 2, 0, 8, None, None, 7, 4])
a, b = lv_nodes.find(root, 2), lv_nodes.find(root, 9)
json.dumps([a.val, a.left.val, b])
`);
    expect(out).toEqual([2, 7, null]);
  });

  it('stops a chain at a cycle', () => {
    const out = pyJson(py, `
import json, lv_nodes
head = lv_nodes.build_list([1, 2, 3])
head.next.next.next = head.next
json.dumps([n.val for n in lv_nodes.chain(head)])
`);
    expect(out).toEqual([1, 2, 3]);
  });

  it('registers every node and unlinks them all one at a time, so a 50,000-node chain frees without a crash', () => {
    const out = pyJson(py, `
import json, lv_nodes
lv_nodes.unlink_all()
head = lv_nodes.build_list(range(50000))
t = lv_nodes.TreeNode(1, lv_nodes.TreeNode(2))
before = len(lv_nodes.REGISTRY)
lv_nodes.unlink_all()
after = [len(lv_nodes.REGISTRY), head.next, t.left]
del head, t
json.dumps([before, after])
`);
    expect(out).toEqual([50002, [0, null, null]]);
  });

  it('tags ListNode and TreeNode for the encoder', () => {
    expect(pyJson(py, `import json, lv_nodes\njson.dumps(sorted(v for k, v in lv_nodes.TAGS.items() if k.__module__ == 'lv_nodes'))`)).toEqual([
      'LNODE',
      'TNODE',
    ]);
  });

  it("implements LeetCode's NestedInteger interface", () => {
    const out = pyJson(py, `
import json
from lv_nodes import NestedInteger
a, b = NestedInteger(), NestedInteger(7)
a.add(b); a.add(NestedInteger())
c = NestedInteger(); c.setInteger(4)
json.dumps([a.isInteger(), a.getInteger(), len(a.getList()), b.isInteger(), b.getInteger(), b.getList(), c.getInteger(), repr(a)])
`);
    expect(out).toEqual([false, null, 2, true, 7, null, 4, '[7, []]']);
  });
});
