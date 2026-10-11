import { layout, setViewport, viewport } from '../state';
import { busy, mode, runState, setMode, stale, stopTrace, trace } from '../tracer';
import { AddMenu } from './AddMenu';
import { fitView, MAX_ZOOM, MIN_ZOOM, zoomAt } from './viewport';

const STEP = 1.25;
const STATUS = { idle: '', starting: 'Starting Python…', tracing: 'Tracing…', restarting: 'Restarting Python…' };

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

function Modes() {
  const m = mode.value;
  return (
    <div class="lv-modes" role="group" aria-label="Mode">
      <button type="button" class="lv-ctrl" data-testid="mode-canvas" aria-pressed={m === 'canvas'} onClick={() => setMode('canvas')}>
        Canvas
      </button>
      <button type="button" class="lv-ctrl" data-testid="mode-trace" aria-pressed={m === 'trace'} onClick={() => setMode('trace')}>
        Trace
      </button>
    </div>
  );
}

// Spec §6.1: in Trace mode the Add menu's place holds Trace (Stop while running), the status line and the stale badge.
function TraceControls() {
  const b = busy.value;
  return (
    <>
      <button
        type="button"
        class={b ? 'lv-ctrl' : 'lv-ctrl lv-primary'}
        data-testid="trace-run"
        title={b ? 'Stop (Esc)' : 'Trace your code on this test case (T)'}
        onClick={() => (b ? stopTrace() : void trace())}
      >
        {b ? 'Stop' : 'Trace'}
      </button>
      <span class="lv-status" role="status" data-testid="trace-status">
        {STATUS[runState.value]}
      </span>
      {stale.value && (
        <button
          type="button"
          class="lv-ctrl lv-stale"
          data-testid="trace-stale"
          title="The code or the test case changed after this trace"
          disabled={b}
          onClick={() => void trace()}
        >
          Stale, re-trace
        </button>
      )}
    </>
  );
}

export function Toolbar() {
  const z = viewport.value.zoom;
  return (
    <div class="lv-toolbar" role="toolbar" aria-label="Board tools">
      <div class="lv-toolbar-left">
        <Modes />
        {mode.value === 'trace' ? <TraceControls /> : <AddMenu />}
      </div>
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
