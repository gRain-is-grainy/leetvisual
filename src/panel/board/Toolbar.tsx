import { layout, setViewport, viewport } from '../state';
import { fitView, MAX_ZOOM, MIN_ZOOM, zoomAt } from './viewport';
import { AddMenu } from './AddMenu';

const STEP = 1.25;

function boardEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-testid="board"]');
}

function zoomBy(f: number): void {
  const el = boardEl();
  setViewport(zoomAt(viewport.value, f, (el?.clientWidth ?? 0) / 2, (el?.clientHeight ?? 0) / 2));
}

function fit(): void {
  const el = boardEl();
  if (!el) return;
  const lay = layout.value;
  const rects = [...el.querySelectorAll<HTMLElement>('[data-card]')]
    .filter((card) => lay[card.dataset.card!])
    .map((card) => ({ ...lay[card.dataset.card!], w: card.offsetWidth, h: card.offsetHeight }));
  setViewport(fitView(rects, el.clientWidth, el.clientHeight));
}

export function Toolbar() {
  const z = viewport.value.zoom;
  return (
    <div class="lv-toolbar" role="toolbar" aria-label="Board tools">
      <div class="lv-toolbar-left"><AddMenu /></div>
      <div class="lv-toolbar-right">
        <button type="button" class="lv-ctrl" data-testid="zoom-out" aria-label="Zoom out" title="Zoom out" disabled={z <= MIN_ZOOM} onClick={() => zoomBy(1 / STEP)}>
          −
        </button>
        <span class="lv-zoom" data-testid="zoom-level">
          {Math.round(z * 100)}%
        </span>
        <button type="button" class="lv-ctrl" data-testid="zoom-in" aria-label="Zoom in" title="Zoom in" disabled={z >= MAX_ZOOM} onClick={() => zoomBy(STEP)}>
          +
        </button>
        <button type="button" class="lv-ctrl" data-testid="fit" title="Fit everything in view" onClick={fit}>
          Fit
        </button>
      </div>
    </div>
  );
}
