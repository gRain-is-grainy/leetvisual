import { byId } from '../model/ids';
import type { NodeId, Pos, TreeS } from '../model/types';
import { roots } from './roots';

export type TreeLayout = { pos: Record<NodeId, Pos>; cols: number; rows: number; back: [NodeId, NodeId][] };

export function layoutTree(s: TreeS): TreeLayout {
  const ids = Object.keys(s.nodes);
  const children = new Set<NodeId>();
  for (const id of ids) {
    const { left, right } = s.nodes[id];
    if (left) children.add(left);
    if (right) children.add(right);
  }
  const pos: Record<NodeId, Pos> = {};
  const back: [NodeId, NodeId][] = [];
  const seen = new Set<NodeId>();
  let cols = 0;
  let rows = 0;

  // Iterative in-order walk: each entry is [node, depth, left subtree done].
  const walk = (root: NodeId) => {
    seen.add(root);
    const stack: [NodeId, number, boolean][] = [[root, 0, false]];
    const enter = (from: NodeId, to: NodeId | null, depth: number) => {
      if (!to) return;
      if (seen.has(to)) back.push([from, to]);
      else {
        seen.add(to);
        stack.push([to, depth, false]);
      }
    };
    while (stack.length) {
      const [id, depth, done] = stack.pop()!;
      if (done) {
        pos[id] = { x: cols++, y: depth };
        rows = Math.max(rows, depth + 1);
        enter(id, s.nodes[id].right, depth + 1);
      } else {
        stack.push([id, depth, true]);
        enter(id, s.nodes[id].left, depth + 1);
      }
    }
  };

  for (const r of roots(ids, children, s.ptrs)) if (!seen.has(r)) walk(r);
  for (const id of ids.sort(byId)) if (!seen.has(id)) walk(id);
  return { pos, cols, rows, back };
}
