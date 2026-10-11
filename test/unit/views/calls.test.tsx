// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { locKey, selKey } from '../../../src/panel/model/loc';
import type { CallFrame, CallsS } from '../../../src/panel/model/types';
import { act, step, view } from '../../../src/panel/state';
import { editing } from '../../../src/panel/ui';
import { changedFrames } from '../../../src/panel/views/diff';
import { board, draft, startSession } from '../../helpers/panel';
import { bySel, Live } from '../../helpers/views';

const calls = (frames: CallFrame[]): CallsS => ({ id: 's1', name: 'calls', kind: 'calls', frames });
const frames = () => (draft().structs.s1 as CallsS).frames;
const button = (r: ReturnType<typeof render>, name: string) => r.getByRole('button', { name }) as HTMLButtonElement;
const dfs = (i: string): CallFrame => ({ fn: 'dfs', locals: [['i', i]] });

afterEach(cleanup);

describe('CallsView', () => {
  it('shows the top frame first', () => {
    startSession(board(calls([dfs('0'), dfs('1')])));
    const { container } = render(<Live id="s1" />);
    const boxes = container.querySelectorAll('.lv-frame');
    expect(boxes).toHaveLength(2);
    expect(boxes[0].classList.contains('lv-frame-top')).toBe(true);
    expect(bySel(boxes[0], { t: 'val', at: { s: 's1', k: 'local', f: 1, i: 0 } }).textContent).toBe('1');
  });

  it('local values are drop targets; function and local names are not', () => {
    startSession(board(calls([dfs('0')])));
    const { container } = render(<Live id="s1" />);
    const value = { s: 's1', k: 'local' as const, f: 0, i: 0 };
    expect(bySel(container, { t: 'val', at: value }).getAttribute('data-drop')).toBe(locKey(value));
    expect(bySel(container, { t: 'val', at: { s: 's1', k: 'fn', f: 0 } }).hasAttribute('data-drop')).toBe(false);
    expect(bySel(container, { t: 'val', at: { s: 's1', k: 'lname', f: 0, i: 0 } }).hasAttribute('data-drop')).toBe(false);
  });

  it('push frame copies the top frame with its local names pre-filled', () => {
    startSession(board(calls([dfs('3')])));
    const r = render(<Live id="s1" />);
    fireEvent.click(button(r, 'Push frame'));
    expect(frames()).toEqual([dfs('3'), { fn: 'dfs', locals: [['i', '']] }]);
  });

  it('push on an empty call stack adds an f frame with no locals', () => {
    startSession(board(calls([])));
    const r = render(<Live id="s1" />);
    fireEvent.click(button(r, 'Push frame'));
    expect(frames()).toEqual([{ fn: 'f', locals: [] }]);
  });

  it('read-only frames disable every control and drop target', () => {
    startSession(board(calls([dfs('0'), dfs('1')])));
    step();
    view(0);
    const { container, getAllByRole } = render(<Live id="s1" />);
    expect(container.querySelector('[data-drop]')).toBeNull();
    expect(getAllByRole('button').every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it('pop frame removes the top and is disabled when empty', () => {
    startSession(board(calls([dfs('0'), dfs('1')])));
    const r = render(<Live id="s1" />);
    fireEvent.click(button(r, 'Pop frame'));
    expect(frames()).toEqual([dfs('0')]);
    cleanup();
    startSession(board(calls([])));
    const e = render(<Live id="s1" />);
    expect(button(e, 'Pop frame').disabled).toBe(true);
    expect(button(e, 'Add local').disabled).toBe(true);
    expect(e.container.querySelector('.lv-empty')!.textContent).toBe('empty');
  });

  it('+ local adds x, then x2, to the top frame and edits the new name', () => {
    startSession(board(calls([{ fn: 'f', locals: [] }])));
    const r = render(<Live id="s1" />);
    fireEvent.click(button(r, 'Add local'));
    expect(frames()[0].locals).toEqual([['x', '']]);
    expect(editing.value).toBe(selKey({ t: 'val', at: { s: 's1', k: 'lname', f: 0, i: 0 } }));
    editing.value = null;
    fireEvent.click(button(r, 'Add local'));
    expect(frames()[0].locals).toEqual([['x', ''], ['x2', '']]);
  });

  it('highlights a frame whose locals changed since the last frame', () => {
    startSession(board(calls([dfs('0'), dfs('1')])));
    step();
    act({ t: 'set', at: { s: 's1', k: 'local', f: 1, i: 0 }, val: '2' });
    const { container } = render(<Live id="s1" />);
    const boxes = container.querySelectorAll('.lv-frame');
    expect(boxes[0].classList.contains('lv-changed')).toBe(true);
    expect(boxes[1].classList.contains('lv-changed')).toBe(false);
  });
});

describe('changedFrames', () => {
  it('reports new frames and frames whose name or locals differ', () => {
    const a = calls([dfs('0'), dfs('1')]);
    const b = calls([dfs('0'), { fn: 'dfs', locals: [['i', '1'], ['j', '0']] }, dfs('2')]);
    expect([...changedFrames(a, b)]).toEqual([1, 2]);
    expect(changedFrames(a, calls([dfs('0'), dfs('1')])).size).toBe(0);
  });
});
