import type { Id, Pos } from '../model/types';
import { GAP, type Rect } from './place';

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function firstOverlap(ids: Id[], at: Record<Id, Rect>): [Id, Id] | null {
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) if (overlaps(at[ids[i]], at[ids[j]])) return [ids[i], ids[j]];
  }
  return null;
}

// Spec §5.7: a card that outgrew its place pushes the cards it would overlap down. Of two overlapping cards the lower
// one moves (the later in `order` when their tops are level), to GAP below the other, until nothing overlaps.
export function pushDown(rects: Record<Id, Rect>, order: Id[]): Record<Id, Pos> {
  const ids = order.filter((id) => rects[id]);
  const rank = new Map(ids.map((id, i) => [id, i]));
  const at: Record<Id, Rect> = {};
  for (const id of ids) at[id] = { ...rects[id] };
  const moved: Record<Id, Pos> = {};
  // Each move only lowers a card, so this ends; the bound is a backstop.
  for (let n = 0; n <= ids.length * ids.length; n++) {
    ids.sort((a, b) => at[a].y - at[b].y || rank.get(a)! - rank.get(b)!);
    const pair = firstOverlap(ids, at);
    if (!pair) break;
    const [upper, lower] = pair;
    at[lower].y = at[upper].y + at[upper].h + GAP;
    moved[lower] = { x: at[lower].x, y: at[lower].y };
  }
  return moved;
}
