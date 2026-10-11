// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addChain } from '../../../src/panel/model/build';
import { locKey, selKey } from '../../../src/panel/model/loc';
import type { ListS, Ptr } from '../../../src/panel/model/types';
import { act, step, view } from '../../../src/panel/state';
import { editing } from '../../../src/panel/ui';
import { changedNodes } from '../../../src/panel/views/diff';
import { MAX_ITEMS } from '../../../src/panel/views/limits';
import { board, draft, startSession } from '../../helpers/panel';
import { bySel, Live } from '../../helpers/views';

vi.mock('../../../src/panel/drag/drag', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/panel/drag/drag')>()),
  startDrag: vi.fn(),
}));
import { startDrag } from '../../../src/panel/drag/drag';

const chain = (...vals: string[]): ListS['nodes'] => {
  const nodes: ListS['nodes'] = {};
  addChain(nodes, vals);
  return nodes;
};
const list = (nodes: ListS['nodes'], ptrs: Ptr[] = []): ListS => ({ id: 's1', name: 'head', kind: 'list', nodes, ptrs });
const node = (n: string) => ({ t: 'val' as const, at: { s: 's1', k: 'node' as const, n } });
const handle = (n: string) => ({ t: 'link' as const, s: 's1', n, side: 'next' as const });
const cur = () => draft().structs.s1 as ListS;

afterEach(() => {
  cleanup();
  vi.mocked(startDrag).mockClear();
});

describe('ListView', () => {
  it('draws a chain left to right with one straight arrow per link', () => {
    startSession(board(list(chain('1', '2', '3'))));
    const { container } = render(<Live id="s1" />);
    expect(container.querySelectorAll('.lv-list-node')).toHaveLength(3);
    expect(container.querySelectorAll('path.lv-arrow')).toHaveLength(2);
    expect(container.querySelectorAll('path.lv-arrow-back')).toHaveLength(0);
    const left = (n: string) => parseFloat(bySel(container, node(n)).closest<HTMLElement>('.lv-list-node')!.style.left);
    expect(left('n1')).toBeLessThan(left('n2'));
    expect(left('n2')).toBeLessThan(left('n3'));
  });

  it('draws a cycle as a back arrow and still renders every node once', () => {
    const nodes = chain('3', '2', '0', '-4');
    nodes.n4 = { ...nodes.n4, next: 'n2' };
    startSession(board(list(nodes, [{ name: 'head', at: 'n1' }])));
    const { container } = render(<Live id="s1" />);
    expect(container.querySelectorAll('.lv-list-node')).toHaveLength(4);
    expect(container.querySelectorAll('path.lv-arrow-back')).toHaveLength(1);
  });

  it('draws a self-loop as a back arrow', () => {
    const nodes = chain('1');
    nodes.n1 = { ...nodes.n1, next: 'n1' };
    startSession(board(list(nodes)));
    const { container } = render(<Live id="s1" />);
    expect(container.querySelectorAll('.lv-list-node')).toHaveLength(1);
    expect(container.querySelectorAll('path.lv-arrow-back')).toHaveLength(1);
  });

  it('draws a link into another chain as a merge arrow, not a back arrow', () => {
    const nodes = chain('1', '2', '3');
    addChain(nodes, ['4', '5']);
    nodes.n5 = { ...nodes.n5, next: 'n2' };
    startSession(board(list(nodes, [{ name: 'a', at: 'n1' }, { name: 'b', at: 'n4' }])));
    const { container } = render(<Live id="s1" />);
    expect(container.querySelectorAll('path.lv-arrow')).toHaveLength(4);
    expect(container.querySelectorAll('path.lv-arrow-merge')).toHaveLength(1);
    expect(container.querySelectorAll('path.lv-arrow-back')).toHaveLength(0);
  });

  it('gives each list card its own arrowhead marker', () => {
    startSession(board(list(chain('1', '2'))));
    const { container } = render(<Live id="s1" />);
    expect(container.querySelector('marker')!.id).toBe('lv-ah-s1');
    expect(container.querySelector('path.lv-arrow')!.getAttribute('marker-end')).toBe('url(#lv-ah-s1)');
  });

  it('puts pointer chips above their node and null pointers in the controls', () => {
    startSession(board(list(chain('1', '2'), [{ name: 'head', at: 'n1' }, { name: 'prev', at: null }])));
    const { container } = render(<Live id="s1" />);
    const head = bySel(container, { t: 'ptr', s: 's1', name: 'head' });
    expect(head.closest('.lv-list-node')).toBe(bySel(container, node('n1')).closest('.lv-list-node'));
    expect(bySel(container, { t: 'ptr', s: 's1', name: 'prev' }).closest('.lv-nullptr')!.textContent).toBe('prev: null');
  });

  it('a handle or a pointer chip drops onto its own node, and each node is one drop target', () => {
    startSession(board(list(chain('1', '2'), [{ name: 'head', at: 'n1' }])));
    const { container } = render(<Live id="s1" />);
    const dropOf = (el: HTMLElement) => el.closest('[data-drop]')!.getAttribute('data-drop');
    expect(dropOf(bySel(container, handle('n2')))).toBe(locKey(node('n2').at));
    expect(dropOf(bySel(container, { t: 'ptr', s: 's1', name: 'head' }))).toBe(locKey(node('n1').at));
    expect(bySel(container, node('n1')).hasAttribute('data-drop')).toBe(false);
    expect(container.querySelectorAll('[data-drop]')).toHaveLength(2);
  });

  it('lists a pointer to a node past the first 200 as hidden', () => {
    const nodes = chain(...Array.from({ length: 250 }, (_, i) => String(i)));
    startSession(board(list(nodes, [{ name: 'far', at: 'n250' }])));
    const { container } = render(<Live id="s1" />);
    expect(bySel(container, { t: 'ptr', s: 's1', name: 'far' }).closest('.lv-ctrls .lv-nullptr')!.textContent).toBe('far: hidden');
  });

  it('handles start a link drag and show whether next is set', () => {
    startSession(board(list(chain('1', '2'))));
    const { container } = render(<Live id="s1" />);
    expect(bySel(container, handle('n1')).classList.contains('lv-handle-set')).toBe(true);
    expect(bySel(container, handle('n2')).classList.contains('lv-handle-set')).toBe(false);
    expect(bySel(container, handle('n1')).tabIndex).toBe(0);
    fireEvent.pointerDown(bySel(container, handle('n1')));
    expect(startDrag).toHaveBeenCalledWith(expect.anything(), handle('n1'));
  });

  it('handles do not start drags on an earlier frame', () => {
    startSession(board(list(chain('1', '2'))));
    step();
    view(0);
    const { container } = render(<Live id="s1" />);
    fireEvent.pointerDown(bySel(container, handle('n1')));
    expect(startDrag).not.toHaveBeenCalled();
    expect(container.querySelector('[data-drop]')).toBeNull();
  });

  it('+ node adds a detached empty node and opens its editor', () => {
    startSession(board(list(chain('1', '2', '3'))));
    const { getByRole } = render(<Live id="s1" />);
    fireEvent.click(getByRole('button', { name: 'Add node' }));
    expect(cur().nodes.n4).toEqual({ val: '', next: null });
    expect(editing.value).toBe(selKey(node('n4')));
  });

  it('+ptr adds a pointer at the lowest node id', () => {
    startSession(board(list(chain('1', '2'))));
    const { getByRole } = render(<Live id="s1" />);
    fireEvent.click(getByRole('button', { name: 'Add pointer' }));
    expect(cur().ptrs).toEqual([{ name: 'i', at: 'n1' }]);
  });

  it('an empty list shows "empty" and +ptr adds a null pointer', () => {
    startSession(board(list({})));
    const { container, getByRole } = render(<Live id="s1" />);
    expect(container.querySelector('.lv-empty')!.textContent).toBe('empty');
    fireEvent.click(getByRole('button', { name: 'Add pointer' }));
    expect(cur().ptrs).toEqual([{ name: 'i', at: null }]);
  });

  it('long literals keep the full value in the title', () => {
    startSession(board(list(chain('-1000000000000000000', '"héllo 🙂"'))));
    const { container } = render(<Live id="s1" />);
    expect(bySel(container, node('n1')).title).toBe('-1000000000000000000');
    expect(bySel(container, node('n2')).title).toBe('"héllo 🙂"');
  });

  it('renders at most 200 nodes', () => {
    startSession(board(list(chain(...Array.from({ length: 250 }, (_, i) => String(i))))));
    const { container } = render(<Live id="s1" />);
    expect(container.querySelectorAll('.lv-list-node')).toHaveLength(MAX_ITEMS);
  });

  it('highlights nodes whose value or link changed since the last frame', () => {
    startSession(board(list(chain('1', '2', '3'))));
    step();
    act({ t: 'set', at: { s: 's1', k: 'node', n: 'n2' }, val: '9' });
    act({ t: 'link', s: 's1', n: 'n3', side: 'next', to: 'n1' });
    const { container } = render(<Live id="s1" />);
    expect(bySel(container, node('n1')).classList.contains('lv-changed')).toBe(false);
    expect(bySel(container, node('n2')).classList.contains('lv-changed')).toBe(true);
    expect(bySel(container, node('n3')).classList.contains('lv-changed')).toBe(true);
  });
});

describe('changedNodes', () => {
  it('reports new nodes and nodes whose value or link differ', () => {
    const a = list(chain('1', '2'));
    const nodes = chain('1', '5', '7');
    const b = list(nodes);
    expect([...changedNodes(a, b)].sort()).toEqual(['n2', 'n3']);
    expect(changedNodes(a, list(chain('1', '2'))).size).toBe(0);
  });
});
