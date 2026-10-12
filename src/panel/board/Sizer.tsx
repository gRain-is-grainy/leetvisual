import type { RefObject } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { flow, place, type Rect, type Size } from '../layout/place';
import { pushDown } from '../layout/push';
import type { Board, Id, Pos } from '../model/types';
import { setTraceLayout, sizing, traceLayout, traceView } from '../tracer';
import { Card } from './Card';

// Spec §5.7: when a trace arrives, render every card's largest version across the trace, hidden, measure them, and
// reserve their places (stacked on a fresh layout, placed around the cards a re-trace kept), so scrubbing never moves
// a card. The copies unmount once measured.
// `tick` changes when the board resizes: @preact/signals' shouldComponentUpdate skips a child whose props are unchanged
// (hook state is ignored), and the effect below must re-run.
// Sizing is remembered per Board, not per mount, so a Canvas to Trace switch keeps the places the user set.
const sized = new WeakSet<Board>();
export function Sizer({ root }: { root: RefObject<HTMLDivElement | null>; tick: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const b = sizing.value;
  const [, rerender] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    const board = root.current;
    // Hidden (display: none) measures 0×0; Board's ResizeObserver re-renders us once the board is shown.
    if (!b || sized.has(b) || !el || !board?.offsetWidth) return;
    const ids = Object.keys(b.structs);
    const sizes: Record<Id, Size> = {};
    for (const id of ids) {
      const card = el.querySelector<HTMLElement>(`[data-card="${id}"]`);
      sizes[id] = { w: card?.offsetWidth ?? 0, h: card?.offsetHeight ?? 0 };
    }
    const lay = traceLayout.value;
    const pos: Record<Id, Pos> = {};
    const kept = ids.filter((id) => lay[id]);
    if (!kept.length) {
      // Wrap to the board's width at zoom 1 (not the remembered zoom): Fit then shrinks a wide layout less than a tall column.
      flow(ids.map((id) => sizes[id]), board.clientWidth).forEach((p, i) => (pos[ids[i]] = p));
    } else {
      const rects: Rect[] = kept.map((id) => ({ ...lay[id], ...sizes[id] }));
      const maxW = board.clientWidth / traceView.value.zoom;
      for (const id of ids) {
        if (lay[id]) continue;
        pos[id] = place(rects, sizes[id], maxW);
        rects.push({ ...pos[id], ...sizes[id] });
      }
      // A kept place may be too small for this trace's version of its card.
      const all: Record<Id, Rect> = {};
      for (const id of ids) all[id] = { ...(pos[id] ?? lay[id]), ...sizes[id] };
      Object.assign(pos, pushDown(all, ids));
    }
    setTraceLayout(pos, sizes);
    sized.add(b);
    rerender((n) => n + 1);
  });

  if (!b || sized.has(b)) return null;
  return (
    <div class="lv-sizer" ref={ref} aria-hidden="true">
      {Object.values(b.structs).map((s) => (
        <Card key={s.id} s={s} isNew={false} ro />
      ))}
    </div>
  );
}
