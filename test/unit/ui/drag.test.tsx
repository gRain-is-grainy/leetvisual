// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Ghost } from '../../../src/panel/drag/Ghost';
import { onKey } from '../../../src/panel/keys';
import type { ArrayS, BagS } from '../../../src/panel/model/types';
import { canvas, readOnly, session, shown, view } from '../../../src/panel/state';
import { drag } from '../../../src/panel/ui';
import { Slot } from '../../../src/panel/views/Slot';
import { arr, board, draft, startSession, stubLayout, vr } from '../../helpers/panel';

const stack: BagS = { id: 's3', name: 'st', kind: 'stack', items: ['1', '2'] };

function Cells() {
  const b = shown.value!;
  const a = b.structs.s1 as ArrayS;
  const st = b.structs.s3 as BagS;
  const ro = readOnly.value;
  return (
    <div>
      {a.items.map((v, i) => (
        <Slot key={i} at={{ s: 's1', k: 'item', i }} val={v} text={v} ro={ro} drop />
      ))}
      <Slot at={{ s: 's2', k: 'var' }} val="9" text="9" ro={ro} drop />
      <Slot at={{ s: 's3', k: 'item', i: st.items.length - 1 }} val={st.items[st.items.length - 1]} text="top" ro={ro} />
      <Ghost />
    </div>
  );
}

let cells: HTMLElement[];
beforeAll(() => stubLayout());
beforeEach(() => {
  startSession(board(arr('s1', 'nums', ['2', '7', '11']), vr('s2', 'target', '9'), stack));
  render(<Cells />);
  cells = [...document.querySelectorAll<HTMLElement>('.lv-slot')].slice(0, 3); // the three nums cells come first
  window.addEventListener('keydown', onKey);
});
afterEach(() => {
  window.removeEventListener('keydown', onKey);
  cleanup();
});

const items = () => (draft().structs.s1 as ArrayS).items;
const under = (el: Element | null) => (document.elementFromPoint = vi.fn(() => el));

function pointer(src: Element, x: number, finish: 'up' | 'cancel' | 'none' = 'up') {
  fireEvent.pointerDown(src, { clientX: 0, clientY: 0, button: 0, pointerId: 1 });
  fireEvent.pointerMove(window, { clientX: x, clientY: 0, pointerId: 1 });
  if (finish === 'up') fireEvent.pointerUp(window, { clientX: x, clientY: 0, pointerId: 1 });
  if (finish === 'cancel') fireEvent.pointerCancel(window, { pointerId: 1 });
}

describe('pointer drag', () => {
  it('swaps two cells of the same array and shows a ghost while moving', () => {
    under(cells[1]);
    pointer(cells[0], 30, 'none');
    expect(drag.value).toMatchObject({ mode: 'pointer', label: '2' });
    expect(document.querySelector<HTMLElement>('.lv-ghost')!.style.left).toBe('40px');
    expect(cells[1].classList.contains('lv-drop-hover')).toBe(true);
    fireEvent.pointerUp(window, { clientX: 30, clientY: 0, pointerId: 1 });
    expect(items()).toEqual(['7', '2', '11']);
    expect(drag.value).toBeNull();
    expect(cells[1].classList.contains('lv-drop-hover')).toBe(false);
  });

  it('copies a value into a variable', () => {
    under(screen.getByText('9'));
    pointer(cells[2], 30);
    expect(draft().structs.s2).toMatchObject({ value: '11' });
  });

  it('treats a move under 4 px as a click', () => {
    under(cells[1]);
    pointer(cells[0], 3);
    expect(items()).toEqual(['2', '7', '11']);
    expect(drag.value).toBeNull();
  });

  it('does nothing when a value is dropped on empty space', () => {
    under(document.body);
    pointer(cells[0], 30);
    expect(items()).toEqual(['2', '7', '11']);
  });

  it('pops the stack when its top is dropped on empty space', () => {
    under(null);
    pointer(screen.getByText('top'), 30);
    expect((draft().structs.s3 as BagS).items).toEqual(['1']);
  });

  it('cancels on Escape', () => {
    under(cells[1]);
    pointer(cells[0], 30, 'none');
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.pointerUp(window, { clientX: 30, clientY: 0, pointerId: 1 });
    expect(items()).toEqual(['2', '7', '11']);
    expect(drag.value).toBeNull();
  });

  it('clears everything on pointercancel', () => {
    under(cells[1]);
    pointer(cells[0], 30, 'cancel');
    expect(drag.value).toBeNull();
    expect(cells[1].classList.contains('lv-drop-hover')).toBe(false);
    expect(items()).toEqual(['2', '7', '11']);
  });

  it('does not drag while viewing an earlier frame', () => {
    view(0);
    under(cells[1]);
    pointer(document.querySelectorAll<HTMLElement>('.lv-slot')[0], 30);
    expect(drag.value).toBeNull();
    expect(items()).toEqual(['2', '7', '11']);
  });

  it('abandons a pointer drag and clears its outline when the canvas switches', () => {
    under(cells[1]);
    pointer(cells[0], 30, 'none');
    session.value = { ...session.value!, key: 'leetcode.com:two-sum:other' };
    expect(drag.value).toBeNull();
    expect(cells[1].classList.contains('lv-drop-hover')).toBe(false);
    fireEvent.pointerMove(window, { clientX: 40, clientY: 0, pointerId: 1 });
    expect(drag.value).toBeNull();
    fireEvent.pointerUp(window, { clientX: 40, clientY: 0, pointerId: 1 });
    expect(items()).toEqual(['2', '7', '11']);
  });

  it('does not make a frame on Enter during a pointer drag', () => {
    under(cells[1]);
    pointer(cells[0], 30, 'none');
    fireEvent.keyDown(cells[0], { key: 'Enter' });
    expect(canvas.value!.frames).toHaveLength(1);
    fireEvent.pointerUp(window, { clientX: 30, clientY: 0, pointerId: 1 });
  });
});

describe('keyboard drag', () => {
  it('picks up with Space, chooses with arrows, drops with Space', () => {
    cells[0].focus();
    fireEvent.keyDown(cells[0], { key: ' ' });
    expect(drag.value).toMatchObject({ mode: 'keyboard', ti: 0 });
    expect(cells[1].classList.contains('lv-drop-target')).toBe(true);
    fireEvent.keyDown(cells[0], { key: 'ArrowRight' });
    expect(cells[2].classList.contains('lv-drop-target')).toBe(true);
    expect(cells[1].classList.contains('lv-drop-target')).toBe(false);
    fireEvent.keyDown(cells[0], { key: ' ' });
    expect(items()).toEqual(['11', '7', '2']);
    expect(drag.value).toBeNull();
  });

  it('offers only accepting targets, never the source itself', () => {
    cells[0].focus();
    fireEvent.keyDown(cells[0], { key: ' ' });
    expect(drag.value!.targets).toEqual([
      { s: 's1', k: 'item', i: 1 },
      { s: 's1', k: 'item', i: 2 },
      { s: 's2', k: 'var' },
    ]);
  });

  it('cycles with Tab and Shift+Tab and keeps Tab from moving focus', () => {
    cells[0].focus();
    fireEvent.keyDown(cells[0], { key: ' ' });
    expect(fireEvent.keyDown(cells[0], { key: 'Tab' })).toBe(false);
    expect(drag.value!.ti).toBe(1);
    fireEvent.keyDown(cells[0], { key: 'Tab', shiftKey: true });
    fireEvent.keyDown(cells[0], { key: 'Tab', shiftKey: true });
    expect(drag.value!.ti).toBe(2);
  });

  it('cancels with Escape', () => {
    cells[0].focus();
    fireEvent.keyDown(cells[0], { key: ' ' });
    fireEvent.keyDown(cells[0], { key: 'Escape' });
    expect(drag.value).toBeNull();
    expect(document.querySelector('.lv-drop-target')).toBeNull();
    expect(items()).toEqual(['2', '7', '11']);
  });

  it('offers empty space first for the stack top, which pops', () => {
    const top = screen.getByText('top');
    top.focus();
    fireEvent.keyDown(top, { key: ' ' });
    expect(drag.value!.targets[0]).toBeNull();
    fireEvent.keyDown(top, { key: ' ' });
    expect((draft().structs.s3 as BagS).items).toEqual(['1']);
  });
});
