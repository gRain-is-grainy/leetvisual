// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { pointerDrag } from '../../../src/panel/drag/drag';
import { act, canvas, setViewport, step, view } from '../../../src/panel/state';
import { Workspace } from '../../../src/panel/Workspace';
import { arr, board, draft, fakeSize, fireResize, layoutOf, startSession, stubLayout, vr } from '../../helpers/panel';

beforeAll(() => stubLayout(100, 60));
// pointerDrag swallows one click until a 0 ms timer fires; flush it so it can't eat the next test's click.
afterEach(async () => {
  cleanup();
  await new Promise((r) => setTimeout(r, 0));
});

const cards = () => [...document.querySelectorAll<HTMLElement>('[data-card]')];
const boardEl = () => screen.getByTestId('board');
type R = { x: number; y: number; w: number; h: number };
const overlaps = (a: R, b: R) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function drag(el: Element, dx: number, dy: number) {
  fireEvent.pointerDown(el, { clientX: 0, clientY: 0, button: 0, pointerId: 1 });
  fireEvent.pointerMove(window, { clientX: dx, clientY: dy, pointerId: 1 });
  fireEvent.pointerUp(window, { clientX: dx, clientY: dy, pointerId: 1 });
}

// happy-dom's WheelEvent ignores ctrlKey, metaKey and clientX/Y in its init dict, so set them by hand.
function wheel(el: Element, init: { deltaX?: number; deltaY?: number; ctrlKey?: boolean }) {
  const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: init.deltaX ?? 0, deltaY: init.deltaY ?? 0 });
  Object.defineProperties(e, {
    ctrlKey: { value: !!init.ctrlKey },
    metaKey: { value: false },
    clientX: { value: 0 },
    clientY: { value: 0 },
  });
  el.dispatchEvent(e);
}

describe('pointerDrag', () => {
  it('swallows the click that follows a drag that moved, but not a plain click', async () => {
    const el = document.createElement('div');
    document.body.append(el);
    const onClick = vi.fn();
    el.addEventListener('click', onClick);
    el.addEventListener('pointerdown', (e) => pointerDrag(e as PointerEvent, { end: () => {} }));
    drag(el, 30, 0);
    fireEvent.click(el);
    expect(onClick).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    drag(el, 0, 0);
    fireEvent.click(el);
    expect(onClick).toHaveBeenCalledTimes(1);
    el.remove();
  });

  it('captures the pointer only after the 4 px threshold, so clicks keep their target', () => {
    const el = document.createElement('div');
    document.body.append(el);
    const capture = vi.spyOn(el, 'setPointerCapture');
    el.addEventListener('pointerdown', (e) => pointerDrag(e as PointerEvent, { end: () => {} }));
    fireEvent.pointerDown(el, { clientX: 0, clientY: 0, button: 0, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 2, clientY: 0, pointerId: 1 });
    expect(capture).not.toHaveBeenCalled();
    fireEvent.pointerMove(window, { clientX: 10, clientY: 0, pointerId: 1 });
    expect(capture).toHaveBeenCalledWith(1);
    fireEvent.pointerUp(window, { clientX: 10, clientY: 0, pointerId: 1 });
    el.remove();
  });

  it('ignores buttons other than the primary one', () => {
    const el = document.createElement('div');
    document.body.append(el);
    const end = vi.fn();
    el.addEventListener('pointerdown', (e) => pointerDrag(e as PointerEvent, { end }));
    fireEvent.pointerDown(el, { clientX: 0, clientY: 0, button: 2, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 30, clientY: 0, pointerId: 1 });
    expect(end).not.toHaveBeenCalled();
    el.remove();
  });
});

describe('Board', () => {
  it('renders one card per structure with its kind and name, in board order', () => {
    startSession(board(arr('s1', 'nums', ['2', '7']), vr('s2', 'target', '9')));
    render(<Workspace />);
    expect(cards().map((c) => [c.dataset.card, c.dataset.kind])).toEqual([
      ['s1', 'array'],
      ['s2', 'var'],
    ]);
    expect(screen.getAllByTestId('card-name').map((n) => n.textContent)).toEqual(['nums', 'target']);
  });

  it('stacks a fresh canvas top to bottom in parameter order, then shows the cards', async () => {
    startSession(board(arr('s1', 'nums', ['2']), vr('s2', 'target', '9')));
    render(<Workspace />);
    expect(layoutOf()).toEqual({ s1: { x: 16, y: 16 }, s2: { x: 16, y: 92 } });
    await waitFor(() => expect(cards().every((c) => c.style.visibility === 'visible')).toBe(true));
  });

  it('positions cards in pixels', () => {
    startSession(board(vr('s1', 'x', '1')), { s1: { x: 16, y: 40 } });
    render(<Workspace />);
    const c = document.querySelector<HTMLElement>('[data-card="s1"]')!;
    expect([c.style.left, c.style.top]).toEqual(['16px', '40px']);
  });

  it('waits to place cards until the board is visible', async () => {
    fakeSize.board.w = 0;
    startSession(board(arr('s1', 'nums', ['2']), vr('s2', 'target', '9')));
    render(<Workspace />);
    expect(layoutOf()).toEqual({});
    fakeSize.board.w = 800;
    fireResize();
    await waitFor(() => expect(layoutOf()).toEqual({ s1: { x: 16, y: 16 }, s2: { x: 16, y: 92 } }));
  });

  it('places a card added later in a free spot that overlaps nothing', async () => {
    startSession(board(arr('s1', 'nums', ['2']), vr('s2', 'target', '9')), { s1: { x: 16, y: 16 }, s2: { x: 16, y: 92 } });
    render(<Workspace />);
    act({ t: 'add', struct: vr('s3', 'x', '0') });
    await waitFor(() => expect(layoutOf().s3).toBeDefined());
    const l = layoutOf();
    for (const id of ['s1', 's2']) {
      expect(overlaps({ ...l.s3, w: 100, h: 60 }, { ...l[id], w: 100, h: 60 })).toBe(false);
    }
  });

  it('deletes a card with its × button and focuses the board', async () => {
    startSession(board(arr('s1', 'nums', ['2']), vr('s2', 'target', '9')));
    render(<Workspace />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete nums' }));
    expect(draft().structs.s1).toBeUndefined();
    await waitFor(() => expect(cards()).toHaveLength(1));
    await waitFor(() => expect(document.activeElement).toBe(boardEl()));
  });

  it('renames a card by double-clicking its name', async () => {
    startSession(board(arr('s1', 'nums', ['2'])));
    render(<Workspace />);
    fireEvent.dblClick(screen.getByTestId('card-name'));
    const input = (await screen.findByRole('textbox', { name: 'Rename card' })) as HTMLInputElement;
    input.value = 'arr';
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(draft().structs.s1.name).toBe('arr');
  });

  it('moves a card by dragging its header, scaled by the zoom, and saves the spot on release', () => {
    startSession(board(vr('s1', 'x', '1')), { s1: { x: 16, y: 16 } });
    setViewport({ x: 0, y: 0, zoom: 2 });
    render(<Workspace />);
    const el = document.querySelector<HTMLElement>('[data-card="s1"]')!;
    fireEvent.pointerDown(el.querySelector('header')!, { clientX: 0, clientY: 0, button: 0, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 40, clientY: 20, pointerId: 1 });
    expect([el.style.left, el.style.top]).toEqual(['36px', '26px']);
    expect(layoutOf().s1).toEqual({ x: 16, y: 16 });
    fireEvent.pointerUp(window, { clientX: 40, clientY: 20, pointerId: 1 });
    expect(layoutOf().s1).toEqual({ x: 36, y: 26 });
  });

  it('puts a dragged card back when the drag is cancelled with Escape', () => {
    startSession(board(vr('s1', 'x', '1')), { s1: { x: 16, y: 16 } });
    render(<Workspace />);
    const el = document.querySelector<HTMLElement>('[data-card="s1"]')!;
    fireEvent.pointerDown(el.querySelector('header')!, { clientX: 0, clientY: 0, button: 0, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 40, clientY: 20, pointerId: 1 });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.pointerUp(window, { clientX: 40, clientY: 20, pointerId: 1 });
    expect([el.style.left, el.style.top]).toEqual(['16px', '16px']);
    expect(layoutOf().s1).toEqual({ x: 16, y: 16 });
  });

  it('pans by dragging empty board space', () => {
    startSession(board(vr('s1', 'x', '1')), { s1: { x: 16, y: 16 } });
    render(<Workspace />);
    drag(boardEl(), 30, 10);
    expect(canvas.value!.view).toEqual({ x: 30, y: 10, zoom: 1 });
  });

  it('zooms with Ctrl+wheel and clamps to 25–200%; a plain wheel pans', () => {
    startSession(board(vr('s1', 'x', '1')), { s1: { x: 16, y: 16 } });
    render(<Workspace />);
    wheel(boardEl(), { deltaY: -1000, ctrlKey: true });
    expect(canvas.value!.view.zoom).toBe(2);
    wheel(boardEl(), { deltaY: 5000, ctrlKey: true });
    expect(canvas.value!.view.zoom).toBe(0.25);
    wheel(boardEl(), { deltaX: 5, deltaY: 7 });
    expect(canvas.value!.view).toMatchObject({ x: -5, y: -7 });
  });

  it('zooms with the toolbar buttons and disables them at the limits', async () => {
    startSession(board(vr('s1', 'x', '1')), { s1: { x: 16, y: 16 } });
    render(<Workspace />);
    expect(screen.getByTestId('zoom-level').textContent).toBe('100%');
    fireEvent.click(screen.getByTestId('zoom-in'));
    await waitFor(() => expect(screen.getByTestId('zoom-level').textContent).toBe('125%'));
    for (let i = 0; i < 10; i++) fireEvent.click(screen.getByTestId('zoom-in'));
    await waitFor(() => expect((screen.getByTestId('zoom-in') as HTMLButtonElement).disabled).toBe(true));
    for (let i = 0; i < 20; i++) fireEvent.click(screen.getByTestId('zoom-out'));
    await waitFor(() => expect((screen.getByTestId('zoom-out') as HTMLButtonElement).disabled).toBe(true));
    expect(canvas.value!.view.zoom).toBe(0.25);
  });

  it('fits every card into the board at no more than 100%', () => {
    startSession(board(vr('s1', 'x', '1'), vr('s2', 'y', '2')), { s1: { x: 500, y: 500 }, s2: { x: 900, y: 700 } });
    render(<Workspace />);
    Object.defineProperty(boardEl(), 'clientWidth', { configurable: true, value: 800 });
    Object.defineProperty(boardEl(), 'clientHeight', { configurable: true, value: 600 });
    fireEvent.click(screen.getByTestId('fit'));
    const v = canvas.value!.view;
    expect(v.zoom).toBe(1);
    expect(500 * v.zoom + v.x).toBe(16);
    expect(500 * v.zoom + v.y).toBe(16);
  });

  it('disables delete while viewing an earlier frame, keeping the card the same size', async () => {
    startSession(board(arr('s1', 'nums', ['2'])));
    render(<Workspace />);
    view(0);
    await waitFor(() => expect((screen.getByRole('button', { name: 'Delete nums' }) as HTMLButtonElement).disabled).toBe(true));
  });

  it('outlines a card that is new since the last frame', async () => {
    startSession(board(arr('s1', 'nums', ['2'])), { s1: { x: 16, y: 16 } });
    render(<Workspace />);
    step();
    act({ t: 'add', struct: vr('s2', 'x', '0') });
    await waitFor(() => expect(document.querySelector('[data-card="s2"]')!.classList.contains('lv-changed-card')).toBe(true));
    expect(document.querySelector('[data-card="s1"]')!.classList.contains('lv-changed-card')).toBe(false);
  });
});
