// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { onKey } from '../../../src/panel/keys';
import { selKey, type Sel } from '../../../src/panel/model/loc';
import type { GridS } from '../../../src/panel/model/types';
import { act, canvas, session, step, view, viewing } from '../../../src/panel/state';
import { editing } from '../../../src/panel/ui';
import { Workspace } from '../../../src/panel/Workspace';
import { arr, board, draft, layoutOf, startSession, stubLayout, vr } from '../../helpers/panel';

const grid: GridS = { id: 's3', name: 'grid', kind: 'grid', rows: [['1', '0']], marked: [], ptrs: [] };

beforeAll(() => stubLayout());
beforeEach(() => {
  startSession(board(arr('s1', 'nums', ['2', '7', '11'], { ptrs: [{ name: 'i', at: 0 }] }), vr('s2', 'target', '9'), grid), {
    s1: { x: 16, y: 16 },
    s2: { x: 16, y: 120 },
    s3: { x: 16, y: 200 },
  });
  render(<Workspace />);
  window.addEventListener('keydown', onKey);
});
afterEach(() => {
  window.removeEventListener('keydown', onKey);
  cleanup();
  document.body.innerHTML = '';
  delete (navigator as { platform?: string }).platform;
});

function focusable(sel: Sel): HTMLElement {
  const el = document.createElement('div');
  el.tabIndex = 0;
  el.dataset.sel = selKey(sel);
  document.body.append(el);
  el.focus();
  return el;
}

const press = (el: Element, key: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(el, { key, ...init });
const items = () => (draft().structs.s1 as { items: string[] }).items;
const setFirst = () => act({ t: 'set', at: { s: 's1', k: 'item', i: 0 }, val: '5' });

describe('keys', () => {
  it('undoes with Ctrl+Z and redoes with Ctrl+Y and Ctrl+Shift+Z', () => {
    setFirst();
    press(document.body, 'z', { ctrlKey: true });
    expect(items()[0]).toBe('2');
    press(document.body, 'y', { ctrlKey: true });
    expect(items()[0]).toBe('5');
    press(document.body, 'z', { ctrlKey: true });
    press(document.body, 'Z', { ctrlKey: true, shiftKey: true });
    expect(items()[0]).toBe('5');
  });

  it('uses Cmd on macOS', () => {
    Object.defineProperty(navigator, 'platform', { configurable: true, value: 'MacIntel' });
    setFirst();
    press(document.body, 'z', { ctrlKey: true });
    expect(items()[0]).toBe('5');
    press(document.body, 'z', { metaKey: true });
    expect(items()[0]).toBe('2');
    press(document.body, 'z', { metaKey: true, shiftKey: true });
    expect(items()[0]).toBe('5');
  });

  it('steps frames with [ and ] and makes a frame with Enter', () => {
    press(document.body, 'Enter');
    press(document.body, 'Enter');
    expect(canvas.value!.frames).toHaveLength(3);
    press(document.body, '[');
    expect(viewing.value).toBe(2);
    press(document.body, '[');
    expect(viewing.value).toBe(1);
    press(document.body, ']');
    press(document.body, ']');
    expect(viewing.value).toBeNull();
  });

  it('leaves Enter to a focused button', () => {
    const b = document.createElement('button');
    document.body.append(b);
    b.focus();
    press(b, 'Enter');
    expect(canvas.value!.frames).toHaveLength(1);
  });

  it('ignores keys typed into form fields', () => {
    setFirst();
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    press(input, 'Enter');
    press(input, '[');
    press(input, 'z', { ctrlKey: true });
    expect(canvas.value!.frames).toHaveLength(1);
    expect(viewing.value).toBeNull();
    expect(items()[0]).toBe('5');
  });

  it('keeps [ ] and Enter working while the scrubber has focus', () => {
    const range = document.createElement('input');
    range.type = 'range';
    document.body.append(range);
    range.focus();
    press(range, 'Enter');
    expect(canvas.value!.frames).toHaveLength(2);
    press(range, '[');
    expect(viewing.value).toBe(1);
  });

  it('removes the last array cell with Delete or Backspace, but not a middle one', () => {
    press(focusable({ t: 'val', at: { s: 's1', k: 'item', i: 0 } }), 'Delete');
    expect(items()).toEqual(['2', '7', '11']);
    press(focusable({ t: 'val', at: { s: 's1', k: 'item', i: 2 } }), 'Backspace');
    expect(items()).toEqual(['2', '7']);
  });

  it('focuses the card after deleting an element', async () => {
    const el = focusable({ t: 'val', at: { s: 's1', k: 'item', i: 2 } });
    press(el, 'Delete');
    el.remove(); // on the real board the deleted cell's slot is gone, which drops focus to <body>
    await new Promise((r) => setTimeout(r, 0));
    expect((document.activeElement as HTMLElement).dataset.sel).toBe(selKey({ t: 'card', s: 's1' }));
  });

  it('deletes a focused card', () => {
    const head = document.querySelector<HTMLElement>('[data-card="s2"] header')!;
    head.focus();
    press(head, 'Delete');
    expect(draft().structs.s2).toBeUndefined();
  });

  it('focuses the board after deleting a card', async () => {
    const head = document.querySelector<HTMLElement>('[data-card="s2"] header')!;
    head.focus();
    press(head, 'Delete');
    await new Promise((r) => setTimeout(r, 0));
    expect((document.activeElement as HTMLElement).dataset.testid).toBe('board');
  });

  it('opens the editor with F2 and closes it with Escape', () => {
    const sel: Sel = { t: 'val', at: { s: 's2', k: 'var' } };
    press(focusable(sel), 'F2');
    expect(editing.value).toBe(selKey(sel));
    press(document.body, 'Escape');
    expect(editing.value).toBeNull();
  });

  it('toggles a grid mark with M', () => {
    const el = focusable({ t: 'val', at: { s: 's3', k: 'cell', r: 0, c: 1 } });
    press(el, 'm');
    expect((draft().structs.s3 as GridS).marked).toEqual(['0,1']);
    press(el, 'M');
    expect((draft().structs.s3 as GridS).marked).toEqual([]);
  });

  it('moves a focused pointer with the arrow keys and stops at the bounds', () => {
    const el = focusable({ t: 'ptr', s: 's1', name: 'i' });
    press(el, 'ArrowLeft');
    expect((draft().structs.s1 as { ptrs: unknown[] }).ptrs).toEqual([{ name: 'i', at: 0 }]);
    press(el, 'ArrowRight');
    press(el, 'ArrowRight');
    press(el, 'ArrowRight');
    expect((draft().structs.s1 as { ptrs: unknown[] }).ptrs).toEqual([{ name: 'i', at: 2 }]);
  });

  it('moves a focused card 16 px per arrow and pans a focused board 40 px', () => {
    const head = document.querySelector<HTMLElement>('[data-card="s1"] header')!;
    head.focus();
    press(head, 'ArrowRight');
    press(head, 'ArrowDown');
    expect(layoutOf().s1).toEqual({ x: 32, y: 32 });
    const b = document.querySelector<HTMLElement>('[data-testid="board"]')!;
    b.focus();
    press(b, 'ArrowRight');
    expect(canvas.value!.view).toMatchObject({ x: -40, y: 0 });
  });

  it('changes nothing while viewing an earlier frame', () => {
    step();
    view(0);
    const before = session.value!.hist;
    press(focusable({ t: 'val', at: { s: 's1', k: 'item', i: 2 } }), 'Delete');
    press(focusable({ t: 'val', at: { s: 's3', k: 'cell', r: 0, c: 0 } }), 'm');
    press(focusable({ t: 'ptr', s: 's1', name: 'i' }), 'ArrowRight');
    press(focusable({ t: 'val', at: { s: 's2', k: 'var' } }), 'F2');
    expect(session.value!.hist).toBe(before);
    expect(editing.value).toBeNull();
  });

  it('steps frames with AltGr brackets on Windows and Option brackets on macOS, but not Cmd+[', () => {
    step();
    press(document.body, '[', { ctrlKey: true, altKey: true });
    expect(viewing.value).toBe(1);
    press(document.body, ']', { ctrlKey: true, altKey: true });
    expect(viewing.value).toBeNull();
    Object.defineProperty(navigator, 'platform', { configurable: true, value: 'MacIntel' });
    press(document.body, '[', { altKey: true });
    expect(viewing.value).toBe(1);
    press(document.body, ']', { altKey: true });
    press(document.body, '[', { metaKey: true });
    expect(viewing.value).toBeNull();
  });

  it('keeps focus on the board after undo removes the focused card', async () => {
    act({ t: 'add', struct: vr('s4', 'y', '0') });
    await new Promise((r) => setTimeout(r, 0));
    const head = document.querySelector<HTMLElement>('[data-card="s4"] header')!;
    head.focus();
    press(head, 'z', { ctrlKey: true });
    await new Promise((r) => setTimeout(r, 0));
    expect((document.activeElement as HTMLElement).dataset.testid).toBe('board');
  });

  it('keeps focus on the board after [ hides the focused draft-only card', async () => {
    step();
    act({ t: 'add', struct: vr('s4', 'y', '0') });
    await new Promise((r) => setTimeout(r, 0));
    const head = document.querySelector<HTMLElement>('[data-card="s4"] header')!;
    head.focus();
    press(head, '[');
    await new Promise((r) => setTimeout(r, 0));
    expect((document.activeElement as HTMLElement).dataset.testid).toBe('board');
  });

  it('moves focus to the card after undo removes the focused value', async () => {
    setFirst();
    const el = focusable({ t: 'val', at: { s: 's1', k: 'item', i: 0 } });
    press(el, 'z', { ctrlKey: true });
    el.remove();
    await new Promise((r) => setTimeout(r, 0));
    expect((document.activeElement as HTMLElement).dataset.sel).toBe(selKey({ t: 'card', s: 's1' }));
  });
});
