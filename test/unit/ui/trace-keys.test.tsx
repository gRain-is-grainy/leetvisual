// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { onKey } from '../../../src/panel/keys';
import { selKey } from '../../../src/panel/model/loc';
import { act, canvas } from '../../../src/panel/state';
import { at, busy, setMode, traceLayout, traceView } from '../../../src/panel/tracer';
import { drag, editing } from '../../../src/panel/ui';
import { Workspace } from '../../../src/panel/Workspace';
import { arr, board, stubLayout, vr } from '../../helpers/panel';
import { result, startTrace, type FakeDeps } from '../../helpers/trace';

const B = [
  board(arr('t:nums', 'nums', ['2', '7']), vr('t:x', 'x', '1')),
  board(arr('t:nums', 'nums', ['2', '7'])),
  board(arr('t:nums', 'nums', ['2', '9'])),
];
const L = { 't:nums': { x: 16, y: 16 }, 't:x': { x: 16, y: 120 } };
let d: FakeDeps;
const press = (el: Element, key: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(el, { key, ...init });
const asks = () => d.sent.filter((m) => m.type === 'getCode').length;
const head = (id: string) => document.querySelector<HTMLElement>(`[data-card="${id}"] header`)!;

beforeAll(() => stubLayout());
beforeEach(async () => {
  d = await startTrace(result(B), L);
  render(<Workspace />);
  window.addEventListener('keydown', onKey);
});
afterEach(() => {
  window.removeEventListener('keydown', onKey);
  cleanup();
});

describe('keys in Trace mode', () => {
  it('steps with [ and ], also with Alt, but not with Ctrl', () => {
    press(document.body, ']');
    expect(at.value).toBe(1);
    press(document.body, ']', { altKey: true });
    expect(at.value).toBe(2);
    press(document.body, '[');
    expect(at.value).toBe(1);
    press(document.body, '[', { ctrlKey: true });
    expect(at.value).toBe(1);
  });

  it('goes to the first and last step with Home and End, except in an input', () => {
    press(document.body, 'End');
    expect(at.value).toBe(2);
    press(document.body, 'Home');
    expect(at.value).toBe(0);
    const range = screen.getByTestId('trace-scrubber');
    range.focus();
    press(range, 'End');
    expect(at.value).toBe(0);
  });

  it('traces with T or Shift+T, not with Ctrl, Meta or Alt, a held key, or while typing', () => {
    press(document.body, 'T', { ctrlKey: true });
    press(document.body, 't', { metaKey: true });
    press(document.body, 't', { altKey: true });
    press(document.body, 't', { repeat: true });
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    press(input, 't');
    input.remove();
    expect(asks()).toBe(0);
    press(document.body, 'T', { shiftKey: true });
    expect(asks()).toBe(1);
    expect(busy.value).toBe(true);
    press(document.body, 't');
    expect(asks()).toBe(1); // already tracing
  });

  it('stops a running trace with Esc, and does nothing otherwise', async () => {
    press(document.body, 'Escape');
    expect(d.runner.stops).toBe(0);
    press(document.body, 't');
    press(document.body, 'Escape');
    expect(d.runner.stops).toBe(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(busy.value).toBe(false);
  });

  it('does nothing for the canvas keys', () => {
    // One canvas edit, so Ctrl+Z has something to undo
    setMode('canvas');
    expect(act({ t: 'set', at: { s: 's1', k: 'item', i: 0 }, val: '9' })).toBe(true);
    setMode('trace');
    const before = canvas.value;
    const slot = document.querySelector<HTMLElement>('[data-card="t:nums"] .lv-slot')!;
    slot.focus();
    for (const [key, init] of [
      ['Enter', {}],
      ['z', { ctrlKey: true }],
      ['y', { ctrlKey: true }],
      ['Delete', {}],
      ['Backspace', {}],
      ['F2', {}],
      [' ', {}],
      ['m', {}],
    ] as [string, KeyboardEventInit][]) {
      press(slot, key, init);
    }
    expect(canvas.value).toBe(before);
    expect([at.value, editing.value, drag.value]).toEqual([0, null, null]);
    expect(asks()).toBe(0);
  });

  it('pans the focused board and moves a focused card in the trace layout', () => {
    const boardEl = screen.getByTestId('board');
    boardEl.focus();
    press(boardEl, 'ArrowUp');
    expect(traceView.value).toEqual({ x: 0, y: 40, zoom: 1 });
    head('t:nums').focus();
    press(head('t:nums'), 'ArrowRight');
    expect(traceLayout.value['t:nums']).toEqual({ x: 32, y: 16 });
    expect(canvas.value!.layout).toEqual({ s1: { x: 16, y: 16 }, s2: { x: 16, y: 120 } });
  });

  it('keeps focus on a card that is still there after a step', async () => {
    head('t:nums').focus();
    press(head('t:nums'), ']');
    await new Promise((r) => setTimeout(r, 0));
    expect((document.activeElement as HTMLElement).dataset.sel).toBe(selKey({ t: 'card', s: 't:nums' }));
  });

  // Review Focus 5
  it('moves focus to the board when stepping away from a card that is gone', async () => {
    head('t:x').focus();
    press(head('t:x'), ']');
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector('[data-card="t:x"]')).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('board'));
    press(document.activeElement!, ']');
    expect(at.value).toBe(2);
  });
});
