import type { Pos } from '../model/types';

export type Size = { w: number; h: number };
export type Rect = Pos & Size;

export const GAP = 16;

function clear(p: Pos, size: Size, r: Rect): boolean {
  return p.x >= r.x + r.w + GAP || r.x >= p.x + size.w + GAP || p.y >= r.y + r.h + GAP || r.y >= p.y + size.h + GAP;
}

// First free spot to the right of, then below, the existing cards, at least GAP from each.
export function place(rects: Rect[], size: Size, maxW: number): Pos {
  const spots: Pos[] = [{ x: GAP, y: GAP }];
  for (const r of rects) spots.push({ x: r.x + r.w + GAP, y: r.y }, { x: r.x, y: r.y + r.h + GAP });
  spots.sort((a, b) => a.y - b.y || a.x - b.x);
  for (const p of spots) {
    if (p.x > GAP && p.x + size.w > maxW) continue;
    if (rects.every((r) => clear(p, size, r))) return p;
  }
  return { x: GAP, y: rects.reduce((y, r) => Math.max(y, r.y + r.h + GAP), GAP) };
}

export function stack(sizes: Size[]): Pos[] {
  let y = GAP;
  return sizes.map((s) => {
    const p = { x: GAP, y };
    y += s.h + GAP;
    return p;
  });
}

// A fresh layout that fills rows within maxW, in order, instead of one tall column.
export function flow(sizes: Size[], maxW: number): Pos[] {
  const rects: Rect[] = [];
  for (const size of sizes) rects.push({ ...place(rects, size, maxW), ...size });
  return rects.map(({ x, y }) => ({ x, y }));
}
