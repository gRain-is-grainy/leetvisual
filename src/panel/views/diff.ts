import type { BagS, GridS, ListS, MapS, NodeId, Ptr, PtrAt, TreeS, Val } from '../model/types';

export function changedIdx(prev: Val[] | undefined, cur: Val[]): Set<number> {
  const out = new Set<number>();
  if (!prev || prev === cur) return out;
  for (let i = 0; i < cur.length; i++) if (prev[i] !== cur[i]) out.add(i);
  return out;
}

const sameAt = (a: PtrAt, b: PtrAt) => (Array.isArray(a) && Array.isArray(b) ? a[0] === b[0] && a[1] === b[1] : a === b);

export function changedPtrs(prev: Ptr[] | undefined, cur: Ptr[]): Set<string> {
  const out = new Set<string>();
  if (!prev || prev === cur) return out;
  for (const p of cur) {
    const q = prev.find((x) => x.name === p.name);
    if (!q || !sameAt(q.at, p.at)) out.add(p.name);
  }
  return out;
}

export function changedCells(prev: GridS | undefined, cur: GridS): Set<string> {
  const out = new Set<string>();
  const was = new Set(prev?.marked ?? []);
  const now = new Set(cur.marked);
  cur.rows.forEach((row, r) =>
    row.forEach((v, c) => {
      const k = `${r},${c}`;
      if (prev?.rows[r]?.[c] !== v || was.has(k) !== now.has(k)) out.add(k);
    }),
  );
  return out;
}

export function changedNodes(prev: ListS | TreeS | undefined, cur: ListS | TreeS): Set<NodeId> {
  const out = new Set<NodeId>();
  for (const [id, n] of Object.entries(cur.nodes) as [NodeId, Record<string, string | null>][]) {
    const p = prev?.nodes[id] as Record<string, string | null> | undefined;
    if (!p || Object.keys(n).some((k) => p[k] !== n[k])) out.add(id);
  }
  return out;
}

export function changedEntries(prev: MapS | undefined, cur: MapS): Set<number> {
  const was = new Map(prev?.entries ?? []);
  const out = new Set<number>();
  cur.entries.forEach(([k, v], i) => {
    if (!was.has(k) || was.get(k) !== v) out.add(i);
  });
  return out;
}

export function changedBag(prev: BagS | undefined, cur: BagS): Set<number> {
  const p = prev?.items ?? [];
  const out = new Set<number>();
  if (cur.kind === 'set') {
    const was = new Set(p);
    cur.items.forEach((v, i) => {
      if (!was.has(v)) out.add(i);
    });
    return out;
  }
  if (cur.kind === 'queue') {
    // Fewest dequeued front items d that leave a non-empty rest of prev as a prefix of cur. With no such d
    // (an edit in the middle, or every item replaced), fall through to the index comparison.
    for (let d = 0; d < p.length; d++) {
      const keep = Math.min(p.length - d, cur.items.length);
      if (keep === 0) break;
      let same = true;
      for (let i = 0; i < keep && same; i++) same = p[d + i] === cur.items[i];
      if (!same) continue;
      for (let i = keep; i < cur.items.length; i++) out.add(i);
      return out;
    }
  }
  return changedIdx(p, cur.items);
}
