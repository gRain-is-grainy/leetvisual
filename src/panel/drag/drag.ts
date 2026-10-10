import { effect } from '@preact/signals';
import { resolveDrop, srcLabel } from '../model/drop';
import { locKey, parseLoc, type Loc, type Src } from '../model/loc';
import { act, readOnly, session, shown } from '../state';
import { drag, refocus, type DragState } from '../ui';

const THRESHOLD = 4;

type DragHandlers = {
  move?(ev: PointerEvent, dx: number, dy: number): void;
  end(ev: PointerEvent, moved: boolean): void;
  cancel?(): void;
};

// With pointer capture the browser fires `click` on the captured source after pointerup, even after a
// real drag. Swallow that one click so dragging a grid cell or a card header doesn't also "click" it.
function swallowNextClick(): void {
  const block = (ev: MouseEvent) => {
    ev.stopPropagation();
    ev.preventDefault();
  };
  window.addEventListener('click', block, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', block, true), 0);
}

// Listeners go on window so a drag survives its source element re-rendering.
export function pointerDrag(e: PointerEvent, h: DragHandlers): void {
  if (e.button !== 0) return;
  const x0 = e.clientX;
  const y0 = e.clientY;
  const source = e.currentTarget as Element;
  const { pointerId } = e;
  let moved = false;
  const onMove = (ev: PointerEvent) => {
    const dx = ev.clientX - x0;
    const dy = ev.clientY - y0;
    if (!moved && Math.hypot(dx, dy) < THRESHOLD) return;
    // Capture only now: Chrome sends click and dblclick to a captured element, which would take a
    // double-click on a card's name away from the name.
    if (!moved && source.isConnected) source.setPointerCapture?.(pointerId);
    moved = true;
    h.move?.(ev, dx, dy);
  };
  const onUp = (ev: PointerEvent) => {
    stop();
    if (moved) swallowNextClick();
    h.end(ev, moved);
  };
  const onCancel = () => {
    stop();
    h.cancel?.();
  };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return;
    ev.preventDefault();
    ev.stopPropagation();
    onCancel();
  };
  function stop() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKey, true);
  }
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('keydown', onKey, true);
}

let hovered: Element | null = null;
let marked: Element | null = null;

function setHover(el: Element | null): void {
  if (hovered === el) return;
  hovered?.classList.remove('lv-drop-hover');
  hovered = el;
  el?.classList.add('lv-drop-hover');
}

function dropEl(x: number, y: number): HTMLElement | null {
  return document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]') ?? null;
}

export function targetAt(x: number, y: number): Loc | null {
  const el = dropEl(x, y);
  return el ? parseLoc(el.dataset.drop!) : null;
}

function markTarget(d: DragState | null): void {
  marked?.classList.remove('lv-drop-target');
  marked = null;
  const t = d?.mode === 'keyboard' ? d.targets[d.ti] : null;
  if (!t) return;
  const k = locKey(t);
  for (const el of document.querySelectorAll<HTMLElement>('[data-drop]')) {
    if (el.dataset.drop === k) {
      el.classList.add('lv-drop-target');
      marked = el;
      return;
    }
  }
}

// Outlines follow the drag state, so they clear however a drag ends: a drop, Esc, or ui.ts closing
// it when the canvas switches.
effect(() => {
  const d = drag.value;
  if (!d) setHover(null);
  markTarget(d);
});

export function cancelDrag(): void {
  drag.value = null;
}

export function startDrag(e: PointerEvent, src: Src): void {
  const b = shown.value;
  if (!b || readOnly.value) return;
  const label = srcLabel(b, src);
  // A canvas switch mid-drag abandons it: the new canvas reuses ids, so the drop would land on it.
  const key = session.value?.key;
  const live = () => session.value?.key === key;
  pointerDrag(e, {
    move(ev) {
      if (!live()) return;
      drag.value = { src, label, mode: 'pointer', x: ev.clientX, y: ev.clientY, targets: [], ti: 0 };
      const el = dropEl(ev.clientX, ev.clientY);
      const loc = el && parseLoc(el.dataset.drop!);
      setHover(loc && resolveDrop(shown.value!, src, loc) ? el : null);
    },
    end(ev, moved) {
      cancelDrag();
      const cur = shown.value;
      if (!moved || !cur || !live()) return;
      const op = resolveDrop(cur, src, targetAt(ev.clientX, ev.clientY));
      if (op) act(op);
    },
    cancel: cancelDrag,
  });
}

export function pickUp(src: Src): void {
  const b = shown.value;
  if (!b || readOnly.value) return;
  const targets: (Loc | null)[] = resolveDrop(b, src, null) ? [null] : [];
  for (const el of document.querySelectorAll<HTMLElement>('[data-drop]')) {
    const loc = parseLoc(el.dataset.drop!);
    if (!loc || (src.t === 'ptr' && loc.s !== src.s)) continue;
    if (resolveDrop(b, src, loc)) targets.push(loc);
  }
  if (!targets.length) return;
  drag.value = { src, label: srcLabel(b, src), mode: 'keyboard', x: 0, y: 0, targets, ti: 0 };
}

export function cycle(d: 1 | -1): void {
  const s = drag.value;
  if (!s || s.mode !== 'keyboard') return;
  drag.value = { ...s, ti: (s.ti + d + s.targets.length) % s.targets.length };
}

export function dropKb(): void {
  const s = drag.value;
  if (!s || s.mode !== 'keyboard') return;
  cancelDrag();
  const b = shown.value;
  const op = b && resolveDrop(b, s.src, s.targets[s.ti]);
  if (op && act(op)) refocus(s.src);
}
