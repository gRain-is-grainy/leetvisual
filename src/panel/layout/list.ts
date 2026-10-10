import { byId } from '../model/ids';
import type { ListS, NodeId, Pos } from '../model/types';
import { roots } from './roots';

export type ListLayout = { pos: Record<NodeId, Pos>; rows: NodeId[][]; cols: number };

export function layoutList(s: ListS): ListLayout {
  const ids = Object.keys(s.nodes);
  const targets = new Set<NodeId>();
  for (const id of ids) {
    const next = s.nodes[id].next;
    if (next) targets.add(next);
  }
  const pos: Record<NodeId, Pos> = {};
  const rows: NodeId[][] = [];
  const placed = new Set<NodeId>();
  const chain = (start: NodeId) => {
    const row: NodeId[] = [];
    for (let n: NodeId | null = start; n && !placed.has(n) && Object.hasOwn(s.nodes, n); n = s.nodes[n].next) {
      placed.add(n);
      pos[n] = { x: row.length, y: rows.length };
      row.push(n);
    }
    rows.push(row);
  };
  for (const r of roots(ids, targets, s.ptrs)) chain(r);
  for (const id of ids.sort(byId)) if (!placed.has(id)) chain(id);
  return { pos, rows, cols: rows.reduce((m, r) => Math.max(m, r.length), 0) };
}
