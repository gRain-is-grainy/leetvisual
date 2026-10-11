import type { GridS, Ptr, PtrAt, Val } from '../model/types';

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
