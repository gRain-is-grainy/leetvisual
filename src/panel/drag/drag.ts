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
