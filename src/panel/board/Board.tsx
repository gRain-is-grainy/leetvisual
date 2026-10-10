import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { pointerDrag } from '../drag/drag';
import { place, stack, type Rect, type Size } from '../layout/place';
import type { Id, Pos } from '../model/types';
import { canvas, placeCards, prevShown, readOnly, setViewport, shown } from '../state';
import { Card } from './Card';
import { zoomAt } from './viewport';

function sizeOf(root: HTMLElement, id: Id): Size {
  const el = root.querySelector<HTMLElement>(`[data-card="${id}"]`);
  return { w: el?.offsetWidth ?? 0, h: el?.offsetHeight ?? 0 };
}

export function Board() {
  const ref = useRef<HTMLDivElement>(null);
  const c = canvas.value!;
  const b = shown.value!;
  const prev = prevShown.value;
  const ro = readOnly.value;
  const [, setTick] = useState(0);

  // The iframe usually receives its first canvas while display: none, when every card measures 0×0.
  // Re-render (and so re-run placement) whenever the board's size changes.
  useEffect(() => {
    const obs = new ResizeObserver(() => setTick((t) => t + 1));
    obs.observe(ref.current!);
    return () => obs.disconnect();
  }, []);

  // Decision 2: unplaced cards render hidden, get measured here, then placed.
  useLayoutEffect(() => {
    const root = ref.current!;
    if (!root.offsetWidth) return; // hidden: wait for the ResizeObserver
    const ids = Object.keys(b.structs);
    const unplaced = ids.filter((id) => !c.layout[id]);
    if (!unplaced.length) return;
    const pos: Record<Id, Pos> = {};
    if (!Object.keys(c.layout).length) {
      const ps = stack(ids.map((id) => sizeOf(root, id)));
      ids.forEach((id, i) => (pos[id] = ps[i]));
    } else {
      const rects: Rect[] = ids.filter((id) => c.layout[id]).map((id) => ({ ...c.layout[id], ...sizeOf(root, id) }));
      const maxW = root.clientWidth / c.view.zoom;
      for (const id of unplaced) {
        const size = sizeOf(root, id);
        const p = place(rects, size, maxW);
        pos[id] = p;
        rects.push({ ...p, ...size });
      }
    }
    placeCards(pos);
  });

  return (
    <div
      ref={ref}
      class="lv-board"
      data-testid="board"
      tabIndex={0}
      aria-label="Board"
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return;
        const v0 = canvas.value!.view;
        pointerDrag(e, {
          move: (_ev, dx, dy) => setViewport({ ...v0, x: v0.x + dx, y: v0.y + dy }),
          end: () => {},
        });
      }}
      onWheel={(e) => {
        e.preventDefault();
        const v = canvas.value!.view;
        if (e.ctrlKey || e.metaKey) {
          const r = ref.current!.getBoundingClientRect();
          setViewport(zoomAt(v, Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top));
        } else {
          setViewport({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
        }
      }}
    >
      <div class="lv-world" style={{ transform: `translate(${c.view.x}px, ${c.view.y}px) scale(${c.view.zoom})` }}>
        {Object.values(b.structs).map((s) => (
          <Card key={s.id} s={s} prev={prev?.structs[s.id]} isNew={!!prev && !prev.structs[s.id]} pos={c.layout[s.id]} ro={ro} />
        ))}
      </div>
    </div>
  );
}
