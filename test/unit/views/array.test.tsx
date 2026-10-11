// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { selKey } from '../../../src/panel/model/loc';
import type { ArrayS } from '../../../src/panel/model/types';
import { act, step, view } from '../../../src/panel/state';
import { editing } from '../../../src/panel/ui';
import { Workspace } from '../../../src/panel/Workspace';
import { arr, board, draft, startSession, stubLayout, vr } from '../../helpers/panel';

beforeAll(() => stubLayout());
afterEach(cleanup);

const L = { s1: { x: 16, y: 16 }, s2: { x: 16, y: 160 } };
const card = (id: string) => document.querySelector<HTMLElement>(`[data-card="${id}"]`)!;
const slots = (id: string) => [...card(id).querySelectorAll<HTMLElement>('.lv-slot')];
const a = () => draft().structs.s1 as ArrayS;

function open(s: ArrayS, ...rest: Parameters<typeof board>) {
  startSession(board(s, ...rest), L);
  render(<Workspace />);
}

describe('ArrayView', () => {
  it('draws cells with their indexes', () => {
    open(arr('s1', 'nums', ['2', '7', '11']));
    expect(slots('s1').map((c) => c.textContent)).toEqual(['2', '7', '11']);
    expect([...card('s1').querySelectorAll('.lv-idx')].map((c) => c.textContent)).toEqual(['0', '1', '2']);
  });

  it('shows string cells unquoted but edits the literal', async () => {
    open(arr('s1', 's', ['"a"', '"b"'], { chars: true }));
    expect(slots('s1').map((c) => c.textContent)).toEqual(['a', 'b']);
    fireEvent.dblClick(slots('s1')[0]);
    expect(((await screen.findByRole('textbox', { name: 'Edit value' })) as HTMLInputElement).value).toBe('"a"');
  });

  it('draws pointer chips above their cell and null pointers in the controls row', () => {
    open(arr('s1', 'nums', ['2', '7'], { ptrs: [{ name: 'i', at: 1 }, { name: 'j', at: null }] }));
    const cols = card('s1').querySelectorAll('.lv-col');
    expect(cols[1].querySelector('.lv-ptr')!.textContent).toBe('i');
    expect(cols[0].querySelector('.lv-ptr')).toBeNull();
    expect(card('s1').querySelector('.lv-ctrls .lv-nullptr')!.textContent).toBe('j: null');
    expect(card('s1').querySelector('.lv-nullptr .lv-ptr')!.textContent).toBe('j');
  });

  it('appends an empty cell and opens its editor', async () => {
    open(arr('s1', 'nums', ['2']));
    fireEvent.click(screen.getByRole('button', { name: 'Append' }));
    expect(a().items).toEqual(['2', '']);
    expect(editing.value).toBe(selKey({ t: 'val', at: { s: 's1', k: 'item', i: 1 } }));
    expect(await screen.findByRole('textbox', { name: 'Edit value' })).toBeTruthy();
  });

  it('removes the last cell and disables removal when empty', async () => {
    open(arr('s1', 'nums', ['2']));
    fireEvent.click(screen.getByRole('button', { name: 'Remove last' }));
    expect(a().items).toEqual([]);
    await waitFor(() => expect((screen.getByRole('button', { name: 'Remove last' }) as HTMLButtonElement).disabled).toBe(true));
  });

  it('adds pointer i at 0, or at null on an empty array', async () => {
    open(arr('s1', 'nums', ['2']));
    fireEvent.click(screen.getByRole('button', { name: 'Add pointer' }));
    expect(a().ptrs).toEqual([{ name: 'i', at: 0 }]);
    act({ t: 'pop', s: 's1' });
    await waitFor(() => expect(slots('s1')).toHaveLength(0));
    fireEvent.click(screen.getByRole('button', { name: 'Add pointer' }));
    expect(a().ptrs.find((p) => p.name === 'j')).toEqual({ name: 'j', at: null });
  });

  it('renames a pointer by double-clicking it', async () => {
    open(arr('s1', 'nums', ['2'], { ptrs: [{ name: 'i', at: 0 }] }));
    fireEvent.dblClick(card('s1').querySelector('.lv-ptr')!);
    const input = (await screen.findByRole('textbox', { name: 'Rename pointer' })) as HTMLInputElement;
    input.value = 'lo';
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(a().ptrs).toEqual([{ name: 'lo', at: 0 }]);
  });

  it('sets a pointer to null when it is dragged off the array', () => {
    open(arr('s1', 'nums', ['2', '7'], { ptrs: [{ name: 'i', at: 1 }] }));
    document.elementFromPoint = vi.fn(() => document.body);
    const chip = card('s1').querySelector('.lv-ptr')!;
    fireEvent.pointerDown(chip, { clientX: 0, clientY: 0, button: 0, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 0, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 0, clientY: 40, pointerId: 1 });
    expect(a().ptrs).toEqual([{ name: 'i', at: null }]);
  });

  it("moves a pointer dropped on another column's pointer row", () => {
    open(arr('s1', 'nums', ['2', '7', '11'], { ptrs: [{ name: 'i', at: 0 }] }));
    const cols = card('s1').querySelectorAll<HTMLElement>('.lv-col');
    document.elementFromPoint = vi.fn(() => cols[2].querySelector('.lv-ptrs'));
    const chip = card('s1').querySelector('.lv-ptr')!;
    fireEvent.pointerDown(chip, { clientX: 0, clientY: 0, button: 0, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 60, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 60, clientY: 0, pointerId: 1 });
    expect(a().ptrs).toEqual([{ name: 'i', at: 2 }]);
  });

  it('highlights cells and pointers that changed since the last frame', async () => {
    open(arr('s1', 'nums', ['2', '7'], { ptrs: [{ name: 'i', at: 0 }] }));
    step();
    act({ t: 'set', at: { s: 's1', k: 'item', i: 1 }, val: '9' });
    act({ t: 'ptr', s: 's1', name: 'i', at: 1 });
    await waitFor(() => expect(slots('s1')[1].classList.contains('lv-changed')).toBe(true));
    expect(slots('s1')[0].classList.contains('lv-changed')).toBe(false);
    expect(card('s1').querySelector('.lv-ptr')!.classList.contains('lv-changed')).toBe(true);
  });

  it('draws only the first 200 cells of a large array, lists pointers past them, and shows the banner', () => {
    open(arr('s1', 'big', Array.from({ length: 250 }, (_, i) => String(i)), { ptrs: [{ name: 'k', at: 220 }] }));
    expect(slots('s1')).toHaveLength(200);
    expect(card('s1').querySelector('.lv-more')!.textContent).toBe('+50');
    expect(card('s1').querySelector('.lv-ctrls .lv-nullptr')!.textContent).toBe('k: 220');
    expect(screen.getByTestId('banner')).toBeTruthy();
  });

  it('shows no banner for a normal board', () => {
    open(arr('s1', 'nums', ['2']));
    expect(screen.queryByTestId('banner')).toBeNull();
  });

  it('disables the controls while viewing an earlier frame', async () => {
    open(arr('s1', 'nums', ['2']));
    view(0);
    for (const name of ['Append', 'Remove last', 'Add pointer']) {
      await waitFor(() => expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true));
    }
  });
});

describe('VarView', () => {
  it('shows the value and highlights it when it changed', async () => {
    open(arr('s1', 'nums', ['2']), vr('s2', 'target', '9'));
    expect(slots('s2').map((c) => c.textContent)).toEqual(['9']);
    step();
    act({ t: 'set', at: { s: 's2', k: 'var' }, val: '10' });
    await waitFor(() => expect(slots('s2')[0].classList.contains('lv-changed')).toBe(true));
    expect(slots('s2')[0].textContent).toBe('10');
  });
});

describe('ArrayView pointers outside the drawn cells', () => {
  it('lists a pointer at the length or below 0 beside the card with its index', () => {
    open(arr('s1', 'nums', ['2', '7'], { ptrs: [{ name: 'i', at: 2 }, { name: 'j', at: -1 }, { name: 'k', at: 1 }] }));
    expect([...card('s1').querySelectorAll('.lv-ctrls .lv-nullptr')].map((n) => n.textContent)).toEqual(['i: 2', 'j: -1']);
    expect(card('s1').querySelectorAll('.lv-col')[1].querySelector('.lv-ptr')!.textContent).toBe('k');
  });
});
