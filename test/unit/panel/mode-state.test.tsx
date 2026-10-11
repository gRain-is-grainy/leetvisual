// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { onKey } from '../../../src/panel/keys';
import { act, canvas, layout, moveCard, placeCards, prevShown, readOnly, setViewport, shown, viewport } from '../../../src/panel/state';
import { setMode, stepTo, traceLayout, traceView } from '../../../src/panel/tracer';
import { editing, startEdit } from '../../../src/panel/ui';
import { Workspace } from '../../../src/panel/Workspace';
import { arr, board, startSession, stubLayout, vr } from '../../helpers/panel';
import { result, startTrace } from '../../helpers/trace';

const B = [
  board(arr('t:nums', 'nums', ['2', '7']), vr('t:target', 'target', '9')),
  board(arr('t:nums', 'nums', ['5', '7']), vr('t:target', 'target', '9')),
];
const L = { 't:nums': { x: 16, y: 16 }, 't:target': { x: 16, y: 120 } };
const CANVAS_LAYOUT = { s1: { x: 16, y: 16 }, s2: { x: 16, y: 120 } };

beforeAll(() => stubLayout());
// pointerDrag swallows one click until a 0 ms timer fires; flush it so it can't eat the next test's click.
afterEach(async () => {
  window.removeEventListener('keydown', onKey);
  cleanup();
  await new Promise((r) => setTimeout(r, 0));
});

describe('mode-aware state', () => {
  it('shows the current step read-only in Trace mode and the canvas draft in Canvas mode', async () => {
    await startTrace(result(B), L);
    expect(shown.value).toBe(B[0]);
    expect(prevShown.value).toBeUndefined();
    expect(readOnly.value).toBe(true);
    stepTo(1);
    expect(shown.value).toBe(B[1]);
    expect(prevShown.value).toBe(B[0]);
    setMode('canvas');
    expect(shown.value).toBe(canvas.value!.draft);
    expect(readOnly.value).toBe(false);
  });

  it('reads and writes the trace layout and viewport in Trace mode, leaving the canvas alone', async () => {
    await startTrace(result(B));
    const before = canvas.value;
    placeCards(L);
    moveCard('t:nums', { x: 40, y: 50 });
    setViewport({ x: 3, y: 4, zoom: 2 });
    expect(layout.value).toEqual({ ...L, 't:nums': { x: 40, y: 50 } });
    expect(layout.value).toBe(traceLayout.value);
    expect(viewport.value).toEqual({ x: 3, y: 4, zoom: 2 });
    expect(canvas.value).toBe(before);
    setMode('canvas');
    expect(layout.value).toBe(canvas.value!.layout);
    expect(viewport.value).toBe(canvas.value!.view);
  });

  it('refuses edits in Trace mode', async () => {
    await startTrace(result(B), L);
    const before = canvas.value;
    expect(act({ t: 'set', at: { s: 't:nums', k: 'item', i: 0 }, val: '1' })).toBe(false);
    startEdit({ t: 'val', at: { s: 't:nums', k: 'item', i: 0 } });
    expect(editing.value).toBeNull();
    expect(canvas.value).toBe(before);
  });

  it('closes an open editor when the mode switches', () => {
    startSession(board(vr('s1', 'x', '1')));
    startEdit({ t: 'val', at: { s: 's1', k: 'var' } });
    expect(editing.value).not.toBeNull();
    setMode('trace');
    expect(editing.value).toBeNull();
  });
});

describe('the board in Trace mode', () => {
  it('draws the current step at the trace layout with disabled controls, and redraws it while scrubbing', async () => {
    await startTrace(result(B), L);
    render(<Workspace />);
    const nums = () => document.querySelector<HTMLElement>('[data-card="t:nums"]')!;
    expect([nums().style.left, nums().style.top]).toEqual(['16px', '16px']);
    expect(nums().querySelector('.lv-slot')!.textContent).toBe('2');
    expect((screen.getByRole('button', { name: 'Append' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Delete nums' }) as HTMLButtonElement).disabled).toBe(true);
    stepTo(1);
    await waitFor(() => expect(nums().querySelector('.lv-slot')!.textContent).toBe('5'));
    expect(nums().querySelector('.lv-slot')!.classList.contains('lv-changed')).toBe(true);
  });

  it('drags a card header into the trace layout at the trace zoom', async () => {
    await startTrace(result(B), L);
    setViewport({ x: 0, y: 0, zoom: 2 });
    render(<Workspace />);
    const head = document.querySelector<HTMLElement>('[data-card="t:nums"] header')!;
    fireEvent.pointerDown(head, { clientX: 0, clientY: 0, button: 0, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 40, clientY: 20, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 40, clientY: 20, pointerId: 1 });
    expect(traceLayout.value['t:nums']).toEqual({ x: 36, y: 26 });
    expect(canvas.value!.layout).toEqual(CANVAS_LAYOUT);
  });

  it('zooms with the toolbar and pans and moves cards with the arrow keys in the trace viewport and layout', async () => {
    await startTrace(result(B), L);
    render(<Workspace />);
    window.addEventListener('keydown', onKey);
    fireEvent.click(screen.getByTestId('zoom-in'));
    expect(traceView.value.zoom).toBe(1.25);
    await waitFor(() => expect(screen.getByTestId('zoom-level').textContent).toBe('125%'));
    const boardEl = screen.getByTestId('board');
    boardEl.focus();
    fireEvent.keyDown(boardEl, { key: 'ArrowLeft' });
    expect(traceView.value).toEqual({ x: 40, y: 0, zoom: 1.25 });
    const head = document.querySelector<HTMLElement>('[data-card="t:nums"] header')!;
    head.focus();
    fireEvent.keyDown(head, { key: 'ArrowDown' });
    expect(traceLayout.value['t:nums']).toEqual({ x: 16, y: 32 });
    expect(canvas.value!.view).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(canvas.value!.layout).toEqual(CANVAS_LAYOUT);
  });
});
