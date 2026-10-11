// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { onKey } from '../../../src/panel/keys';
import { locKey, selKey } from '../../../src/panel/model/loc';
import type { MapS } from '../../../src/panel/model/types';
import { act, step, view } from '../../../src/panel/state';
import { editing } from '../../../src/panel/ui';
import { changedEntries } from '../../../src/panel/views/diff';
import { MAX_ITEMS } from '../../../src/panel/views/limits';
import { board, draft, startSession } from '../../helpers/panel';
import { bySel, Live } from '../../helpers/views';

const map = (entries: [string, string][]): MapS => ({ id: 's1', name: 'seen', kind: 'map', entries });
const key = (i: number) => ({ t: 'val' as const, at: { s: 's1', k: 'key' as const, i } });
const val = (i: number) => ({ t: 'val' as const, at: { s: 's1', k: 'val' as const, i } });
const entries = () => (draft().structs.s1 as MapS).entries;

beforeAll(() => window.addEventListener('keydown', onKey));
afterAll(() => window.removeEventListener('keydown', onKey));
afterEach(cleanup);

describe('MapView', () => {
  it('renders keys and values as drop targets and "+ key" as an add target', () => {
    startSession(board(map([['2', '0'], ['7', '1']])));
    const { container } = render(<Live id="s1" />);
    expect(container.querySelectorAll('.lv-map-row')).toHaveLength(2);
    expect(bySel(container, key(1)).textContent).toBe('7');
    expect(bySel(container, val(1)).getAttribute('data-drop')).toBe(locKey(val(1).at));
    expect(bySel(container, key(0)).getAttribute('data-drop')).toBe(locKey(key(0).at));
    expect(container.querySelector('.lv-add-drop')!.getAttribute('data-drop')).toBe(locKey({ s: 's1', k: 'add' }));
  });

  it('+ key adds an empty entry and edits its key', () => {
    startSession(board(map([['2', '0']])));
    const { getByRole } = render(<Live id="s1" />);
    fireEvent.click(getByRole('button', { name: 'Add entry' }));
    expect(entries()).toEqual([['2', '0'], ['', '']]);
    expect(editing.value).toBe(selKey(key(1)));
  });

  it('a second + key edits the existing empty key instead of adding a duplicate', () => {
    startSession(board(map([['', '5'], ['2', '0']])));
    const { getByRole } = render(<Live id="s1" />);
    fireEvent.click(getByRole('button', { name: 'Add entry' }));
    expect(entries()).toHaveLength(2);
    expect(editing.value).toBe(selKey(key(0)));
  });

  it('Delete on a key removes its entry', () => {
    startSession(board(map([['2', '0'], ['7', '1']])));
    const { container } = render(<Live id="s1" />);
    const el = bySel(container, key(0));
    el.focus();
    fireEvent.keyDown(el, { key: 'Delete' });
    expect(entries()).toEqual([['7', '1']]);
  });

  it('the × on a row deletes that entry with the mouse', () => {
    startSession(board(map([['2', '0'], ['7', '1']])));
    const { getAllByRole } = render(<Live id="s1" />);
    const buttons = getAllByRole('button', { name: 'Delete entry' });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]);
    expect(entries()).toEqual([['7', '1']]);
  });

  it('an earlier frame disables the map\'s buttons and drop targets', () => {
    startSession(board(map([['2', '0']])));
    step();
    view(0);
    const { container, getAllByRole } = render(<Live id="s1" />);
    expect(getAllByRole('button').every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    expect(container.querySelector('[data-drop]')).toBeNull();
  });

  it('shows "empty" when there are no entries', () => {
    startSession(board(map([])));
    const { container } = render(<Live id="s1" />);
    expect(container.querySelector('.lv-empty')!.textContent).toBe('empty');
  });

  it('renders at most 200 entries', () => {
    startSession(board(map(Array.from({ length: 250 }, (_, i) => [String(i), '0'] as [string, string]))));
    const { container } = render(<Live id="s1" />);
    expect(container.querySelectorAll('.lv-map-row')).toHaveLength(MAX_ITEMS);
  });

  it('highlights new and changed entries since the last frame', () => {
    startSession(board(map([['2', '0'], ['7', '1']])));
    step();
    act({ t: 'set', at: { s: 's1', k: 'val', i: 1 }, val: '9' });
    act({ t: 'putKey', s: 's1', key: '11' });
    const { container } = render(<Live id="s1" />);
    expect(bySel(container, val(0)).classList.contains('lv-changed')).toBe(false);
    expect(bySel(container, val(1)).classList.contains('lv-changed')).toBe(true);
    expect(bySel(container, key(2)).classList.contains('lv-changed')).toBe(true);
  });
});

describe('changedEntries', () => {
  it('matches entries by key, not by position', () => {
    expect([...changedEntries(map([['a', '1'], ['b', '2']]), map([['b', '2'], ['a', '3'], ['c', '0']]))]).toEqual([1, 2]);
  });
});
