import type { PyodideAPI } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import type { RTrace, RVal } from '../../../src/panel/trace/raw';
import { heapAt, listItems, loadHarness, runJob, treeVals } from '../../helpers/py';

let py: PyodideAPI;
beforeAll(async () => {
  py = await loadHarness();
}, 60_000);

const value = (t: RTrace): RVal | undefined => (t.end.kind === 'return' ? t.end.value : undefined);
// A returned node's val, from the trace's last heap.
const nodeVal = (t: RTrace) => {
  const v = value(t);
  return Array.isArray(v) ? (heapAt(t.steps)[v[1]][1] as string) : v;
};
const trace = (slug: string, code: string, inputs: string[]) => runJob(py, { code, slug, inputs });

// LeetCode's examples for each adapter (index: LeetCode Facts), traced with an idiomatic solution.
describe('adapters', () => {
  it('linked-list-cycle builds the cycle from pos', () => {
    const code = `class Solution:
    def hasCycle(self, head: Optional[ListNode]) -> bool:
        slow = fast = head
        while fast and fast.next:
            slow, fast = slow.next, fast.next.next
            if slow is fast:
                return True
        return False
`;
    expect([['[3,2,0,-4]', '1'], ['[1,2]', '0'], ['[1]', '-1']].map((i) => value(trace('linked-list-cycle', code, i)))).toEqual(['True', 'True', 'False']);
    const t = trace('linked-list-cycle', code, ['[3,2,0,-4]', '1']);
    expect(t.entry.lists).toEqual(['head']);
    const heap = heapAt(t.steps, 0);
    expect(heap[5]).toEqual(['LNODE', '-4', ['R', 3]]);
  });

  it('linked-list-cycle-ii returns the node where the cycle starts', () => {
    const code = `class Solution:
    def detectCycle(self, head):
        seen = set()
        while head:
            if head in seen:
                return head
            seen.add(head)
            head = head.next
        return None
`;
    expect(nodeVal(trace('linked-list-cycle-ii', code, ['[3,2,0,-4]', '1']))).toBe('2');
    expect(nodeVal(trace('linked-list-cycle-ii', code, ['[1,2]', '0']))).toBe('1');
    expect(value(trace('linked-list-cycle-ii', code, ['[1]', '-1']))).toBe('None');
  });

  it('intersection-of-two-linked-lists joins listB onto listA after skipB nodes', () => {
    const code = `class Solution:
    def getIntersectionNode(self, headA, headB):
        a, b = headA, headB
        while a is not b:
            a = a.next if a else headB
            b = b.next if b else headA
        return a
`;
    const t = trace('intersection-of-two-linked-lists', code, ['8', '[4,1,8,4,5]', '[5,6,1,8,4,5]', '2', '3']);
    expect(nodeVal(t)).toBe('8');
    expect(t.entry.lists).toEqual(['headA', 'headB']);
    expect(nodeVal(trace('intersection-of-two-linked-lists', code, ['2', '[1,9,1,2,4]', '[3,2,4]', '3', '1']))).toBe('2');
    expect(value(trace('intersection-of-two-linked-lists', code, ['0', '[2,6,4]', '[1,5]', '3', '2']))).toBe('None');
  });

  it('lowest-common-ancestor-of-a-binary-search-tree passes p and q as nodes', () => {
    const code = `class Solution:
    def lowestCommonAncestor(self, root, p, q):
        while root:
            if p.val < root.val and q.val < root.val:
                root = root.left
            elif p.val > root.val and q.val > root.val:
                root = root.right
            else:
                return root
`;
    const slug = 'lowest-common-ancestor-of-a-binary-search-tree';
    const root = '[6,2,8,0,4,7,9,null,null,3,5]';
    expect([[root, '2', '8'], [root, '2', '4'], ['[2,1]', '2', '1']].map((i) => nodeVal(trace(slug, code, i)))).toEqual(['6', '2', '2']);
    expect(trace(slug, code, [root, '2', '8']).entry.trees).toEqual(['root', 'p', 'q']);
  });

  it('lowest-common-ancestor-of-a-binary-tree passes p and q as nodes', () => {
    const code = `class Solution:
    def lowestCommonAncestor(self, root, p, q):
        if not root or root is p or root is q:
            return root
        left = self.lowestCommonAncestor(root.left, p, q)
        right = self.lowestCommonAncestor(root.right, p, q)
        return root if left and right else left or right
`;
    const slug = 'lowest-common-ancestor-of-a-binary-tree';
    const root = '[3,5,1,6,2,0,8,null,null,7,4]';
    expect([[root, '5', '1'], [root, '5', '4'], ['[1,2]', '1', '2']].map((i) => nodeVal(trace(slug, code, i)))).toEqual(['3', '5', '1']);
  });

  it('all-nodes-distance-k-in-binary-tree passes target as a node and k as an int', () => {
    const code = `class Solution:
    def distanceK(self, root, target, k):
        parent = {}
        def walk(node, up):
            if node:
                parent[node] = up
                walk(node.left, node)
                walk(node.right, node)
        walk(root, None)
        seen, level = {target}, [target]
        for _ in range(k):
            nxt = []
            for node in level:
                for m in (node.left, node.right, parent[node]):
                    if m and m not in seen:
                        seen.add(m)
                        nxt.append(m)
            level = nxt
        return sorted(node.val for node in level)
`;
    const slug = 'all-nodes-distance-k-in-binary-tree';
    const t = trace(slug, code, ['[3,5,1,6,2,0,8,null,null,7,4]', '5', '2']);
    expect(listItems(t, value(t))).toEqual(['1', '4', '7']);
    const one = trace(slug, code, ['[1]', '1', '3']);
    expect(listItems(one, value(one))).toEqual([]);
  });

  it('clone-graph builds the 1-indexed adjacency list as Node objects, and defines Node for the user', () => {
    const code = `class Solution:
    def cloneGraph(self, node):
        if not node:
            return None
        copies = {}
        def clone(n):
            if n not in copies:
                copies[n] = Node(n.val)
                copies[n].neighbors = [clone(m) for m in n.neighbors]
            return copies[n]
        return clone(node)
`;
    const t = trace('clone-graph', code, ['[[2,4],[1,3],[2,4],[1,3]]']);
    expect(t.end.kind).toBe('return');
    const adjacency = `class Solution:
    def cloneGraph(self, node):
        out, seen, queue = [], {node}, [node]
        while queue:
            n = queue.pop(0)
            out.append([n.val, [m.val for m in n.neighbors]])
            for m in n.neighbors:
                if m not in seen:
                    seen.add(m)
                    queue.append(m)
        return sorted(out)
`;
    const adj = trace('clone-graph', adjacency, ['[[2,4],[1,3],[2,4],[1,3]]']);
    expect(listItems(adj, value(adj))).toEqual([['1', ['2', '4']], ['2', ['1', '3']], ['3', ['2', '4']], ['4', ['1', '3']]]);
    expect(value(trace('clone-graph', code, ['[]']))).toBe('None');
    const single = trace('clone-graph', adjacency, ['[[]]']);
    expect(listItems(single, value(single))).toEqual([['1', []]]);
  });

  it('copy-list-with-random-pointer builds val/random-index pairs as Node objects drawn as list nodes', () => {
    const code = `class Solution:
    def copyRandomList(self, head):
        nodes = []
        while head:
            nodes.append(head)
            head = head.next
        return [[n.val, nodes.index(n.random) if n.random else None] for n in nodes]
`;
    const t = trace('copy-list-with-random-pointer', code, ['[[7,null],[13,0],[11,4],[10,2],[1,0]]']);
    expect(listItems(t, value(t))).toEqual([['7', 'None'], ['13', '0'], ['11', '4'], ['10', '2'], ['1', '0']]);
    expect(t.entry.lists).toEqual(['head']);
    expect(heapAt(t.steps, 0)[2]).toEqual(['LNODE', '7', ['R', 3]]);
  });

  it('populating-next-right-pointers-in-each-node-ii builds Node objects drawn as tree nodes', () => {
    const code = `class Solution:
    def connect(self, root):
        level = [root] if root else []
        out = []
        while level:
            for a, b in zip(level, level[1:]):
                a.next = b
            out += [n.val for n in level] + ["#"]
            level = [c for n in level for c in (n.left, n.right) if c]
        return out
`;
    const t = trace('populating-next-right-pointers-in-each-node-ii', code, ['[1,2,3,4,5,null,7]']);
    expect(listItems(t, value(t))).toEqual(['1', '"#"', '2', '3', '"#"', '4', '5', '7', '"#"']);
    expect(t.entry.trees).toEqual(['root']);
    const empty = trace('populating-next-right-pointers-in-each-node-ii', code, ['[]']);
    expect(listItems(empty, value(empty))).toEqual([]);
  });

  it('first-bad-version defines isBadVersion from the hidden bad parameter', () => {
    const code = `class Solution:
    def firstBadVersion(self, n: int) -> int:
        lo, hi = 1, n
        while lo < hi:
            mid = (lo + hi) // 2
            if isBadVersion(mid):
                hi = mid
            else:
                lo = mid + 1
        return lo
`;
    expect([['5', '4'], ['1', '1']].map((i) => value(trace('first-bad-version', code, i)))).toEqual(['4', '1']);
  });

  it('guess-number-higher-or-lower defines guess from the hidden pick parameter', () => {
    const code = `class Solution:
    def guessNumber(self, n: int) -> int:
        lo, hi = 1, n
        while True:
            mid = (lo + hi) // 2
            g = guess(mid)
            if g == 0:
                return mid
            if g < 0:
                hi = mid - 1
            else:
                lo = mid + 1
`;
    expect([['10', '6'], ['1', '1'], ['2', '1']].map((i) => value(trace('guess-number-higher-or-lower', code, i)))).toEqual(['6', '1', '1']);
  });

  it("serialize-and-deserialize-binary-tree drives LeetCode's Codec round trip", () => {
    const code = `class Codec:
    def serialize(self, root):
        out, queue = [], deque([root])
        while queue:
            node = queue.popleft()
            if node:
                out.append(str(node.val))
                queue += [node.left, node.right]
            else:
                out.append("#")
        return ",".join(out)

    def deserialize(self, data):
        vals = data.split(",")
        if vals[0] == "#":
            return None
        root = TreeNode(int(vals[0]))
        queue, i = deque([root]), 1
        while queue:
            node = queue.popleft()
            for side in ("left", "right"):
                if vals[i] != "#":
                    child = TreeNode(int(vals[i]))
                    setattr(node, side, child)
                    queue.append(child)
                i += 1
        return root
`;
    const t = trace('serialize-and-deserialize-binary-tree', code, ['[1,2,3,null,null,4,5]']);
    expect(treeVals(t, value(t))).toEqual(['1', '2', '3', null, null, '4', '5']);
    expect(t.entry.trees).toEqual(['root']);
    const fns = new Set(t.steps.flatMap((s) => [s.push?.fn, ...(s.stack ?? []).map((f) => f.fn)]).filter(Boolean));
    expect(fns).toEqual(new Set(['Codec.serialize', 'Codec.deserialize']));
    expect(value(trace('serialize-and-deserialize-binary-tree', code, ['[]']))).toBe('None');
  });

  it('wins over the manual-signature check: an adapter slug is never unsupported', () => {
    const t = runJob(py, {
      code: 'class Solution:\n    def hasCycle(self, head):\n        return False\n',
      slug: 'linked-list-cycle',
      meta: { name: 'hasCycle', params: [{ name: 'head', type: 'ListNode' }, { name: 'pos', type: 'integer' }], manual: true },
      inputs: ['[1]', '-1'],
    });
    expect(t.end).toEqual({ kind: 'return', value: 'False' });
  });

  it("reports an adapter's malformed input by its parameter name", () => {
    expect(trace('linked-list-cycle', 'class Solution:\n    pass\n', ['[1]', '"x"']).end).toEqual({ kind: 'input', param: 'pos' });
    expect(trace('first-bad-version', 'class Solution:\n    pass\n', ['5']).end).toEqual({ kind: 'input', param: 'bad' });
  });

  it('reports out-of-range or mistyped adapter inputs by parameter name instead of raising', () => {
    const stub = 'class Solution:\n    pass\n';
    const end = (slug: string, inputs: string[]) => {
      const t = trace(slug, stub, inputs);
      expect(t.steps).toEqual([]);
      return t.end;
    };
    const slug = 'intersection-of-two-linked-lists';
    expect(end(slug, ['8', '[4,1,8]', '[5]', '-10', '0'])).toEqual({ kind: 'input', param: 'skipA' });
    expect(end(slug, ['1', '[]', '[5]', '-1', '0'])).toEqual({ kind: 'input', param: 'skipA' });
    expect(end(slug, ['8', '[4,1,8]', '[5]', '2', '-1'])).toEqual({ kind: 'input', param: 'skipB' });
    for (const edges of ['[[2,5]]', '[["a"]]', '[[0]]', '[[true]]', '[5]']) {
      expect(end('clone-graph', [edges])).toEqual({ kind: 'input', param: 'edges' });
    }
    for (const head of ['[[7,9]]', '[[]]', '[[7]]', '[[null,null]]', '[[7,true]]', '[[true,null]]', '[5]']) {
      expect(end('copy-list-with-random-pointer', [head])).toEqual({ kind: 'input', param: 'head' });
    }
  });
});
