import { cancelDrag, cycle, dropKb, pickUp } from './drag/drag';
import { deleteOp } from './model/drop';
import { parseSel, type Sel } from './model/loc';
import { stepPtr, type Dir } from './model/ptr';
import { act, canvas, layout, moveCard, readOnly, redoAct, setViewport, shown, step, undoAct, viewBy, viewport } from './state';
import { busy, mode, stepBy, stepTo, stopTrace, trace } from './tracer';
import { drag, editing, focusSel, refocus, startEdit } from './ui';

const ARROWS: Record<string, Dir> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
const CARD_STEP = 16;
const PAN_STEP = 40;

const isMac = () => navigator.platform.startsWith('Mac');
const unit = (d: Dir) => ({ x: d === 'left' ? -1 : d === 'right' ? 1 : 0, y: d === 'up' ? -1 : d === 'down' ? 1 : 0 });

// Text fields keep their keys. A focused range (the scrubber) does not, so [ ] Enter and undo still work.
function typing(el: HTMLElement): boolean {
  if (el.tagName === 'INPUT') return (el as HTMLInputElement).type !== 'range';
  return el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

function focusedSel(): Sel | null {
  const k = (document.activeElement as HTMLElement | null)?.dataset?.sel;
  return k ? parseSel(k) : null;
}

function remove(e: KeyboardEvent, sel: Sel | null): void {
  const b = shown.value;
  if (!sel || !b || readOnly.value) return;
  const op = deleteOp(b, sel);
  if (!op) return;
  e.preventDefault();
  if (!act(op)) return;
  // A removed card drops focus to <body>: move it to the board. A removed element: to its card.
  refocus(sel.t === 'card' ? null : { t: 'card', s: sel.t === 'val' ? sel.at.s : sel.s });
}

function arrow(e: KeyboardEvent, sel: Sel | null, dir: Dir, el: HTMLElement): void {
  if (sel?.t === 'ptr') {
    const s = shown.value?.structs[sel.s];
    if (!s || !('ptrs' in s)) return;
    e.preventDefault();
    const at = stepPtr(s, sel.name, dir);
    // The chip is re-created in its new cell. Chrome runs input before timers, so refocus's setTimeout could let the
    // next arrow land on <body>. Preact renders in a microtask, so a microtask queued after act() finds the new chip.
    if (at !== undefined && act({ t: 'ptr', s: sel.s, name: sel.name, at })) queueMicrotask(() => focusSel(sel));
    return;
  }
  if (!canvas.value) return;
  const d = unit(dir);
  if (sel?.t === 'card') {
    const p = layout.value[sel.s];
    if (!p) return;
    e.preventDefault();
    moveCard(sel.s, { x: p.x + d.x * CARD_STEP, y: p.y + d.y * CARD_STEP });
  } else if (el.dataset.testid === 'board') {
    e.preventDefault();
    const v = viewport.value;
    setViewport({ ...v, x: v.x - d.x * PAN_STEP, y: v.y - d.y * PAN_STEP });
  }
}

function dragKey(e: KeyboardEvent): void {
  if (e.key === ' ') {
    e.preventDefault();
    dropKb();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    cancelDrag();
  } else if (e.key === 'Tab') {
    e.preventDefault();
    cycle(e.shiftKey ? -1 : 1);
  } else if (e.key in ARROWS) {
    e.preventDefault();
    cycle(e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1);
  }
}

// Spec §6.3: the board is read-only in Trace mode, so only stepping, tracing, stopping and the arrow keys do anything.
function traceKey(e: KeyboardEvent, el: HTMLElement): void {
  if ((e.key === '[' || e.key === ']') && !e.metaKey && (e.altKey || !e.ctrlKey)) {
    e.preventDefault();
    const was = focusedSel();
    stepBy(e.key === '[' ? -1 : 1);
    if (was) refocus(was);
    return;
  }
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === 'Home' || e.key === 'End') {
    if (el.tagName === 'INPUT') return; // the focused scrubber moves itself
    e.preventDefault();
    const was = focusedSel();
    stepTo(e.key === 'Home' ? 0 : Number.MAX_SAFE_INTEGER);
    if (was) refocus(was);
    return;
  }
  if (e.key === 't' || e.key === 'T') {
    e.preventDefault();
    if (!e.repeat && !busy.value) void trace();
    return;
  }
  if (e.key === 'Escape') {
    if (busy.value) stopTrace();
    return;
  }
  const dir = ARROWS[e.key];
  if (dir) arrow(e, focusedSel(), dir, el);
}

export function onKey(e: KeyboardEvent): void {
  const el = e.target as HTMLElement;
  if (typing(el)) return;
  if (mode.value === 'trace') {
    traceKey(e, el);
    return;
  }
  if (drag.value?.mode === 'keyboard') {
    dragKey(e);
    return;
  }
  // Ctrl+Alt is AltGr on Windows, so it is not the mod key.
  if (isMac() ? e.metaKey : e.ctrlKey && !e.altKey) {
    const k = e.key.toLowerCase();
    const was = focusedSel();
    if (k === 'z') {
      e.preventDefault();
      if (e.shiftKey) redoAct();
      else undoAct();
    } else if (k === 'y' && !isMac()) {
      e.preventDefault();
      redoAct();
    } else return;
    if (was) refocus(was);
    return;
  }
  // [ and ] need AltGr (Windows) or Option (macOS) on many layouts, so Alt is allowed. Cmd/Ctrl+[ is the browser's.
  if ((e.key === '[' || e.key === ']') && !e.metaKey && (e.altKey || !e.ctrlKey)) {
    e.preventDefault();
    const was = focusedSel();
    viewBy(e.key === '[' ? -1 : 1);
    if (was) refocus(was);
    return;
  }
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === 'Escape') {
    editing.value = null;
    return;
  }
  if (e.key === 'Enter') {
    if (el.tagName !== 'BUTTON' && !drag.value) {
      e.preventDefault();
      if (!e.repeat) step(); // a held Enter would make a frame per key repeat
    }
    return;
  }
  const sel = focusedSel();
  if (e.key === 'F2') {
    if (sel) {
      e.preventDefault();
      startEdit(sel);
    }
    return;
  }
  if (e.key === ' ') {
    if (el.tagName !== 'BUTTON' && sel && sel.t !== 'card' && !drag.value) {
      e.preventDefault();
      pickUp(sel);
    }
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    remove(e, sel);
    return;
  }
  if ((e.key === 'm' || e.key === 'M') && sel?.t === 'val' && sel.at.k === 'cell') {
    e.preventDefault();
    act({ t: 'mark', s: sel.at.s, r: sel.at.r, c: sel.at.c });
    return;
  }
  const dir = ARROWS[e.key];
  if (dir) arrow(e, sel, dir, el);
}
