import { byId } from '../model/ids';
import type { NodeId, Ptr } from '../model/types';

// Nodes nothing points to: pointer targets first, in pointer order, then by id.
export function roots(ids: NodeId[], targets: Set<NodeId>, ptrs: Ptr[]): NodeId[] {
  const free = new Set(ids.filter((id) => !targets.has(id)));
  const first: NodeId[] = [];
  for (const p of ptrs) {
    if (typeof p.at === 'string' && free.has(p.at) && !first.includes(p.at)) first.push(p.at);
  }
  return [...first, ...[...free].filter((id) => !first.includes(id)).sort(byId)];
}
