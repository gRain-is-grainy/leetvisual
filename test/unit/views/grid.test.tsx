// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { locKey, selKey } from '../../../src/panel/model/loc';
import type { GridS, Ptr } from '../../../src/panel/model/types';
import { act, step, view } from '../../../src/panel/state';
import { editing } from '../../../src/panel/ui';
import { changedCells } from '../../../src/panel/views/diff';
import { MAX_GRID } from '../../../src/panel/views/limits';
import { groupPtrs } from '../../../src/panel/views/Ptrs';
import { board, draft, startSession } from '../../helpers/panel';
import { bySel, Live } from '../../helpers/views';

const grid = (rows: string[][], extra: Partial<GridS> = {}): GridS => ({
  id: 's1', name: 'grid', kind: 'grid', rows, marked: [], ptrs: [], ...extra,
});
const cell = (r: number, c: number) => ({ t: 'val' as const, at: { s: 's1', k: 'cell' as const, r, c } });
const cur = () => draft().structs.s1 as GridS;
const marked = () => [...cur().marked].sort();

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('GridView', () => {
  it('renders ragged rows of drop-target cells, each placed in its own grid row and column', () => {
    startSession(board(grid([['1', '2', '3'], ['4']])));
    const { container } = render(<Live id="s1" />);
    const rows = container.querySelectorAll('.lv-grid-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelectorAll('.lv-slot')).toHaveLength(3);
    expect(rows[1].querySelectorAll('.lv-slot')).toHaveLength(1);
    expect(bySel(container, cell(1, 0)).textContent).toBe('4');
    const wrap = bySel(container, cell(1, 0)).closest<HTMLElement>('.lv-grid-cell')!;
    expect(wrap.getAttribute('data-drop')).toBe(locKey(cell(1, 0).at));
    expect(bySel(container, cell(1, 0)).hasAttribute('data-drop')).toBe(false);
    // Explicit placement makes every column as wide as its widest cell, so columns line up.
    expect(wrap.style.gridRow).toBe('2');
    expect(wrap.style.gridColumn).toBe('1');
  });

  it('shows string cells unquoted only when every cell is a string', () => {
    startSession(board(grid([['"1"', '"0"'], ['"."']])));
    const a = render(<Live id="s1" />);
    expect(bySel(a.container, cell(0, 1)).textContent).toBe('0');
    expect(bySel(a.container, cell(1, 0)).textContent).toBe('.');
    cleanup();
    startSession(board(grid([['"a"', '7']])));
    const b = render(<Live id="s1" />);
    expect(bySel(b.container, cell(0, 0)).textContent).toBe('"a"');
  });

  it('renders an empty grid and a one-empty-row grid; +ptr then gives a null pointer', () => {
    startSession(board(grid([])));
    const a = render(<Live id="s1" />);
    expect(a.container.querySelectorAll('.lv-slot')).toHaveLength(0);
    fireEvent.click(a.getByRole('button', { name: 'Add pointer' }));
    expect(cur().ptrs).toEqual([{ name: 'i', at: null }]);
    cleanup();
    startSession(board(grid([[]])));
    const b = render(<Live id="s1" />);
    expect(b.container.querySelectorAll('.lv-grid-row')).toHaveLength(1);
    fireEvent.click(b.getByRole('button', { name: 'Add pointer' }));
    expect(cur().ptrs).toEqual([{ name: 'i', at: null }]);
  });

  it('marks a cell 250 ms after a single click', () => {
    vi.useFakeTimers();
    startSession(board(grid([['1', '0']])));
    const { container } = render(<Live id="s1" />);
    fireEvent.click(bySel(container, cell(0, 1)), { detail: 1 });
    vi.advanceTimersByTime(249);
    expect(marked()).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(marked()).toEqual(['0,1']);
  });

  it('a pending mark is dropped when the grid unmounts before the delay ends', () => {
    vi.useFakeTimers();
    startSession(board(grid([['1', '0']])));
    const { container } = render(<Live id="s1" />);
    fireEvent.click(bySel(container, cell(0, 1)), { detail: 1 });
    cleanup();
    vi.advanceTimersByTime(300);
    expect(marked()).toEqual([]);
  });

  it('a double-click opens the editor without toggling the mark', () => {
    vi.useFakeTimers();
    startSession(board(grid([['1', '0']])));
    const { container } = render(<Live id="s1" />);
    const el = bySel(container, cell(0, 0));
    fireEvent.click(el, { detail: 1 });
    fireEvent.click(el, { detail: 2 });
    fireEvent.dblClick(el);
    vi.advanceTimersByTime(500);
    expect(marked()).toEqual([]);
    expect(editing.value).toBe(selKey(cell(0, 0)));
  });

  it('clicking another cell applies the pending mark first', () => {
    vi.useFakeTimers();
    startSession(board(grid([['1', '0']])));
    const { container } = render(<Live id="s1" />);
    fireEvent.click(bySel(container, cell(0, 0)), { detail: 1 });
    fireEvent.click(bySel(container, cell(0, 1)), { detail: 1 });
    vi.advanceTimersByTime(250);
    expect(marked()).toEqual(['0,0', '0,1']);
  });

  it('shows marked cells', () => {
    startSession(board(grid([['1', '0']], { marked: ['0,1'] })));
    const { container } = render(<Live id="s1" />);
    expect(bySel(container, cell(0, 1)).classList.contains('lv-marked')).toBe(true);
    expect(bySel(container, cell(0, 0)).classList.contains('lv-marked')).toBe(false);
  });

  it('draws pointers above their cell, inside its drop target, and null pointers in the controls', () => {
    const ptrs: Ptr[] = [{ name: 'p', at: [1, 0] }, { name: 'q', at: null }];
    startSession(board(grid([['1', '2'], ['3', '4']], { ptrs })));
    const { container } = render(<Live id="s1" />);
    const p = bySel(container, { t: 'ptr', s: 's1', name: 'p' });
    expect(p.closest('.lv-grid-cell')).toBe(bySel(container, cell(1, 0)).closest('.lv-grid-cell'));
    // A pointer dropped on the chips above a cell lands on that cell, not on empty space.
    expect(p.closest('[data-drop]')!.getAttribute('data-drop')).toBe(locKey(cell(1, 0).at));
    const q = bySel(container, { t: 'ptr', s: 's1', name: 'q' });
    expect(q.closest('.lv-ctrls')).not.toBeNull();
    expect(q.closest('.lv-nullptr')!.textContent).toBe('q: null');
  });

  it('lists a pointer past the drawn cells in the controls with its position', () => {
    const rows = Array.from({ length: 41 }, () => ['0']);
    startSession(board(grid(rows, { ptrs: [{ name: 'p', at: [40, 0] }] })));
    const { container } = render(<Live id="s1" />);
    const p = bySel(container, { t: 'ptr', s: 's1', name: 'p' });
    expect(p.closest('.lv-ctrls .lv-nullptr')!.textContent).toBe('p: [40, 0]');
  });

  it('+ptr adds a pointer at [0, 0] without opening an editor', () => {
    startSession(board(grid([['1']])));
    const { getByRole } = render(<Live id="s1" />);
    fireEvent.click(getByRole('button', { name: 'Add pointer' }));
    expect(cur().ptrs).toEqual([{ name: 'i', at: [0, 0] }]);
    expect(editing.value).toBeNull();
  });

  it('renders at most 30×30 cells', () => {
    const rows = Array.from({ length: 31 }, () => Array.from({ length: 31 }, () => '0'));
    startSession(board(grid(rows)));
    const { container } = render(<Live id="s1" />);
    expect(container.querySelectorAll('.lv-grid .lv-slot')).toHaveLength(MAX_GRID * MAX_GRID);
  });

  it('is inert on an earlier frame: no drop targets, disabled controls, clicks do not mark', () => {
    vi.useFakeTimers();
    startSession(board(grid([['1']])));
    step();
    view(0);
    const { container, getByRole } = render(<Live id="s1" />);
    const el = bySel(container, cell(0, 0));
    expect(container.querySelector('[data-drop]')).toBeNull();
    expect((getByRole('button', { name: 'Add pointer' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(el, { detail: 1 });
    vi.advanceTimersByTime(300);
    expect(marked()).toEqual([]);
  });

  it('highlights cells and marks that changed since the last frame', () => {
    startSession(board(grid([['1', '2'], ['3']])));
    step();
    act({ t: 'set', at: { s: 's1', k: 'cell', r: 0, c: 1 }, val: '9' });
    act({ t: 'mark', s: 's1', r: 1, c: 0 });
    const { container } = render(<Live id="s1" />);
    expect(bySel(container, cell(0, 1)).classList.contains('lv-changed')).toBe(true);
    expect(bySel(container, cell(1, 0)).classList.contains('lv-changed')).toBe(true);
    expect(bySel(container, cell(0, 0)).classList.contains('lv-changed')).toBe(false);
  });
});

describe('changedCells', () => {
  it('reports value and mark changes, including new cells', () => {
    const a = grid([['1', '2']]);
    const b = grid([['1', '3'], ['4']], { marked: ['0,0'] });
    expect([...changedCells(a, b)].sort()).toEqual(['0,0', '0,1', '1,0']);
  });

  it('reports nothing for equal grids', () => {
    expect(changedCells(grid([['1']], { marked: ['0,0'] }), grid([['1']], { marked: ['0,0'] })).size).toBe(0);
  });
});

describe('groupPtrs', () => {
  it('groups non-null pointers by position', () => {
    const a: Ptr = { name: 'a', at: [1, 2] };
    const b: Ptr = { name: 'b', at: [1, 2] };
    const c: Ptr = { name: 'c', at: 'n3' };
    const d: Ptr = { name: 'd', at: null };
    const e: Ptr = { name: 'e', at: 0 };
    expect(groupPtrs([a, b, c, d, e])).toEqual(new Map([['1,2', [a, b]], ['n3', [c]], ['0', [e]]]));
  });
});

describe('GridView pointers outside the drawn cells', () => {
  it('lists a pointer below 0, past its row or past the last row beside the card with its position', () => {
    startSession(
      board(
        grid([['1', '0'], ['0']], {
          ptrs: [
            { name: 'a', at: [5, -1] },
            { name: 'b', at: [1, 1] },
            { name: 'c', at: [-1, 0] },
            { name: 'd', at: [0, 1] },
          ],
        }),
      ),
    );
    const { container } = render(<Live id="s1" />);
    expect([...container.querySelectorAll('.lv-ctrls .lv-nullptr')].map((n) => n.textContent)).toEqual(['a: [5, -1]', 'b: [1, 1]', 'c: [-1, 0]']);
    expect(bySel(container, { t: 'ptr', s: 's1', name: 'd' }).closest('.lv-grid-cell')).not.toBeNull();
  });
});
