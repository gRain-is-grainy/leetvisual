// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initHist, newCanvas } from '../../../src/panel/model/history';
import { locKey, selKey } from '../../../src/panel/model/loc';
import { session, view } from '../../../src/panel/state';
import { drag, editing, startEdit } from '../../../src/panel/ui';
import { Slot } from '../../../src/panel/views/Slot';
import { arr, board, draft, startSession } from '../../helpers/panel';

afterEach(cleanup);

const at = { s: 's1', k: 'item', i: 0 } as const;

function setup(ro = false): HTMLElement {
  startSession(board(arr('s1', 'nums', ['2', '7'])));
  render(<Slot at={at} val="2" text="2" ro={ro} drop />);
  return screen.getByText('2');
}

const editor = () => screen.getByRole('textbox', { name: 'Edit value' }) as HTMLInputElement;

describe('Slot', () => {
  it('is focusable and carries its selection and drop keys', () => {
    const el = setup();
    expect(el.tabIndex).toBe(0);
    expect(el.dataset.sel).toBe(selKey({ t: 'val', at }));
    expect(el.dataset.drop).toBe(locKey(at));
    expect(el.title).toBe('2');
  });

  it('opens the editor on double-click and commits the trimmed literal on Enter', () => {
    fireEvent.dblClick(setup());
    const input = editor();
    expect(input.value).toBe('2');
    input.value = ' 5 ';
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(draft().structs.s1).toMatchObject({ items: ['5', '7'] });
    expect(editing.value).toBeNull();
  });

  it('follows its current location when the same slot is re-rendered at another one', () => {
    startSession(board(arr('s1', 'nums', ['2', '7'])));
    editing.value = selKey({ t: 'val', at: { s: 's1', k: 'item', i: 1 } });
    const { rerender } = render(<Slot at={at} val="2" text="2" ro={false} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    rerender(<Slot at={{ s: 's1', k: 'item', i: 1 }} val="7" text="7" ro={false} />);
    expect(editor().value).toBe('7');
  });

  it('cancels on Escape', () => {
    fireEvent.dblClick(setup());
    const input = editor();
    input.value = '9';
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(draft().structs.s1).toMatchObject({ items: ['2', '7'] });
    expect(editing.value).toBeNull();
  });

  it('commits on blur and keeps escaped quotes literally', () => {
    fireEvent.dblClick(setup());
    const input = editor();
    input.value = '"a\\"b"';
    fireEvent.blur(input);
    expect(draft().structs.s1).toMatchObject({ items: ['"a\\"b"', '7'] });
  });

  it('keeps editor keys away from the window handler', () => {
    const spy = vi.fn();
    window.addEventListener('keydown', spy);
    fireEvent.dblClick(setup());
    fireEvent.keyDown(editor(), { key: 'Enter' });
    window.removeEventListener('keydown', spy);
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns focus to the slot after committing', async () => {
    fireEvent.dblClick(setup());
    fireEvent.keyDown(editor(), { key: 'Enter' });
    await new Promise((r) => setTimeout(r, 0));
    expect((document.activeElement as HTMLElement).dataset.sel).toBe(selKey({ t: 'val', at }));
  });

  it('leaves focus where the user moved it when a blur commits', async () => {
    fireEvent.dblClick(setup());
    const input = editor();
    const other = document.createElement('input');
    document.body.append(other);
    other.focus();
    fireEvent.blur(input);
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement).toBe(other);
    other.remove();
  });

  it('neither edits nor accepts drops while viewing an earlier frame', () => {
    const el = setup(true);
    view(0);
    fireEvent.dblClick(el);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(el.hasAttribute('data-drop')).toBe(false);
  });

  it('does not start editing a slot that does not exist', () => {
    setup();
    startEdit({ t: 'val', at: { s: 's1', k: 'item', i: 9 } });
    expect(editing.value).toBeNull();
  });

  it('closes an open editor and drag when the session switches canvas', () => {
    fireEvent.dblClick(setup());
    drag.value = { src: { t: 'val', at }, label: '2', mode: 'keyboard', x: 0, y: 0, targets: [null], ti: 0 };
    expect(editing.value).not.toBeNull();
    session.value = { ...session.value!, key: 'leetcode.com:two-sum:other' };
    expect(editing.value).toBeNull();
    expect(drag.value).toBeNull();
  });

  it('does not commit an open editor into the next canvas', () => {
    fireEvent.dblClick(setup());
    const input = editor();
    input.value = '5';
    session.value = {
      key: 'leetcode.com:two-sum:other',
      slug: 'two-sum',
      hist: initHist(newCanvas(board(arr('s1', 'nums', ['3', '4'])))),
    };
    fireEvent.blur(input); // Chrome fires blur when it removes the focused editor
    expect(draft().structs.s1).toMatchObject({ items: ['3', '4'] });
  });
});
