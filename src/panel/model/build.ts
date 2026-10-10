import { idNum, nextId } from './ids';
import type { ListNode, NodeId, TreeNode, Val } from './types';

function counter(nodes: Record<NodeId, unknown>): () => NodeId {
  let n = idNum(nextId('n', Object.keys(nodes)));
  return () => 'n' + n++;
}

export function addChain(nodes: Record<NodeId, ListNode>, vals: Val[]): NodeId | null {
  const id = counter(nodes);
  let head: NodeId | null = null;
  let prev: ListNode | null = null;
  for (const val of vals) {
    const n = id();
    const node: ListNode = { val, next: null };
    nodes[n] = node;
    if (prev) prev.next = n;
    else head = n;
    prev = node;
  }
  return head;
}

export function addTree(nodes: Record<NodeId, TreeNode>, vals: Val[]): NodeId | null {
  if (vals.length === 0 || vals[0] === 'null') return null;
  const id = counter(nodes);
  const make = (val: Val): NodeId => {
    const n = id();
    nodes[n] = { val, left: null, right: null };
    return n;
  };
  const root = make(vals[0]);
  const queue: NodeId[] = [root];
  let i = 1;
  for (let q = 0; q < queue.length && i < vals.length; q++) {
    const parent = nodes[queue[q]];
    for (const side of ['left', 'right'] as const) {
      if (i >= vals.length) break;
      const val = vals[i++];
      if (val === 'null') continue;
      const child = make(val);
      parent[side] = child;
      queue.push(child);
    }
  }
  return root;
}
