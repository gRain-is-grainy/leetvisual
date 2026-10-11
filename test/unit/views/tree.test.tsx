// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { addTree } from '../../../src/panel/model/build';
import { locKey, selKey } from '../../../src/panel/model/loc';
import type { Ptr, TreeS } from '../../../src/panel/model/types';
import { act, step } from '../../../src/panel/state';
import { editing } from '../../../src/panel/ui';
import { MAX_NODES } from '../../../src/panel/views/limits';
import { visibleTree } from '../../../src/panel/views/TreeView';
import { board, draft, startSession } from '../../helpers/panel';
import { bySel, Live } from '../../helpers/views';

const tree = (vals: string[], ptrs?: Ptr[]): TreeS => {
  const nodes: TreeS['nodes'] = {};
  const root = addTree(nodes, vals);
  return { id: 's1', name: 'root', kind: 'tree', nodes, ptrs: ptrs ?? [{ name: 'root', at: root }] };
};
const node = (n: string) => ({ t: 'val' as const, at: { s: 's1', k: 'node' as const, n } });
const link = (n: string, side: 'left' | 'right') => ({ t: 'link' as const, s: 's1', n, side });
const cur = () => draft().structs.s1 as TreeS;
const left = (el: HTMLElement) => parseFloat(el.closest<HTMLElement>('.lv-tree-node')!.style.left);

afterEach(cleanup);

describe('TreeView', () => {
  it('[1,2,3] renders three nodes in in-order position with two edges and two handles each', () => {
    startSession(board(tree(['1', '2', '3'])));
    const { container } = render(<Live id="s1" />);
    expect(container.querySelectorAll('.lv-tree-node')).toHaveLength(3);
    expect(container.querySelectorAll('path.lv-edge')).toHaveLength(2);
    expect(container.querySelectorAll('.lv-handle')).toHaveLength(6);
    expect(left(bySel(container, node('n2')))).toBeLessThan(left(bySel(container, node('n1'))));
    expect(left(bySel(container, node('n1')))).toBeLessThan(left(bySel(container, node('n3'))));
    expect(bySel(container, link('n1', 'left')).classList.contains('lv-handle-set')).toBe(true);
    expect(bySel(container, link('n2', 'left')).classList.contains('lv-handle-set')).toBe(false);
  });

  it('[1,null,2] has only a right edge', () => {
    startSession(board(tree(['1', 'null', '2'])));
    const { container } = render(<Live id="s1" />);
    expect(container.querySelectorAll('.lv-tree-node')).toHaveLength(2);
    expect(container.querySelectorAll('path.lv-edge')).toHaveLength(1);
    expect(bySel(container, link('n1', 'left')).classList.contains('lv-handle-set')).toBe(false);
    expect(bySel(container, link('n1', 'right')).classList.contains('lv-handle-set')).toBe(true);
  });

  it('a child rewired to an ancestor is drawn as a back edge', () => {
    const t = tree(['1', '2', '3']);
    t.nodes.n3 = { ...t.nodes.n3, left: 'n1' };
    startSession(board(t));
    const { container } = render(<Live id="s1" />);
    expect(container.querySelectorAll('.lv-tree-node')).toHaveLength(3);
    expect(container.querySelectorAll('path.lv-edge')).toHaveLength(2);
    expect(container.querySelectorAll('path.lv-edge-back')).toHaveLength(1);
  });

  it('a back edge to an ancestor ends under it, between its handles, not on its pointer chips', () => {
    const t = tree(['1', '2', '3']);
    t.nodes.n3 = { ...t.nodes.n3, left: 'n1' };
    startSession(board(t));
    const { container } = render(<Live id="s1" />);
    // n1 is in column 1 of row 0 (COL 48, PTR_H 18, NODE_W 40, NODE_H 32, HANDLE_H 10).
    const end = container.querySelector('path.lv-edge-back')!.getAttribute('d')!.split(/[ A-Z]/).filter(Boolean).slice(-2).map(Number);
    expect(end).toEqual([48 + 20, 18 + 32 + 10]);
  });

  it('draws a detached subtree beside the main tree', () => {
    const t = tree(['1', '2']);
    t.nodes.n9 = { val: '7', left: null, right: null };
    startSession(board(t));
    const { container } = render(<Live id="s1" />);
    expect(container.querySelectorAll('.lv-tree-node')).toHaveLength(3);
    expect(left(bySel(container, node('n9')))).toBeGreaterThan(left(bySel(container, node('n1'))));
  });

  it('renders the first 127 nodes in BFS order', () => {
    startSession(board(tree(Array.from({ length: 200 }, (_, i) => String(i + 1)))));
    const { container } = render(<Live id="s1" />);
    expect(container.querySelectorAll('.lv-tree-node')).toHaveLength(MAX_NODES);
    expect(() => bySel(container, node('n127'))).not.toThrow();
    expect(() => bySel(container, node('n128'))).toThrow();
  });

  it('an empty tree shows "empty" and its null root pointer', () => {
    startSession(board(tree([], [{ name: 'root', at: null }])));
    const { container } = render(<Live id="s1" />);
    expect(container.querySelector('.lv-empty')!.textContent).toBe('empty');
    expect(bySel(container, { t: 'ptr', s: 's1', name: 'root' }).closest('.lv-nullptr')!.textContent).toBe('root: null');
  });

  it('puts the root pointer chip above the root node', () => {
    startSession(board(tree(['1', '2'])));
    const { container } = render(<Live id="s1" />);
    const chip = bySel(container, { t: 'ptr', s: 's1', name: 'root' });
    expect(chip.closest('.lv-tree-node')).toBe(bySel(container, node('n1')).closest('.lv-tree-node'));
  });

  it('handles and the root chip drop onto their node, and each node is one drop target', () => {
    startSession(board(tree(['1', '2'])));
    const { container } = render(<Live id="s1" />);
    const dropOf = (el: HTMLElement) => el.closest('[data-drop]')!.getAttribute('data-drop');
    expect(dropOf(bySel(container, link('n2', 'right')))).toBe(locKey(node('n2').at));
    expect(dropOf(bySel(container, { t: 'ptr', s: 's1', name: 'root' }))).toBe(locKey(node('n1').at));
    expect(bySel(container, node('n1')).hasAttribute('data-drop')).toBe(false);
    expect(container.querySelectorAll('[data-drop]')).toHaveLength(2);
  });

  it('lists a pointer to a hidden node as hidden', () => {
    const vals = Array.from({ length: 130 }, (_, i) => String(i));
    startSession(board(tree(vals, [{ name: 'root', at: 'n1' }, { name: 'far', at: 'n130' }])));
    const { container } = render(<Live id="s1" />);
    expect(bySel(container, { t: 'ptr', s: 's1', name: 'far' }).closest('.lv-ctrls .lv-nullptr')!.textContent).toBe('far: hidden');
    expect(bySel(container, { t: 'ptr', s: 's1', name: 'root' }).closest('.lv-tree-node')).not.toBeNull();
  });

  it('node slots carry their full value as title', () => {
    startSession(board(tree(['-1000000000000000000'])));
    const { container } = render(<Live id="s1" />);
    expect(bySel(container, node('n1')).title).toBe('-1000000000000000000');
  });

  it('+ node adds a detached node and edits it; +ptr points at the lowest id', () => {
    startSession(board(tree(['1'])));
    const { getByRole } = render(<Live id="s1" />);
    fireEvent.click(getByRole('button', { name: 'Add node' }));
    expect(cur().nodes.n2).toEqual({ val: '', left: null, right: null });
    expect(editing.value).toBe(selKey(node('n2')));
    fireEvent.click(getByRole('button', { name: 'Add pointer' }));
    expect(cur().ptrs).toEqual([{ name: 'root', at: 'n1' }, { name: 'i', at: 'n1' }]);
  });

  it('highlights a node whose value changed since the last frame', () => {
    startSession(board(tree(['1', '2', '3'])));
    step();
    act({ t: 'set', at: { s: 's1', k: 'node', n: 'n2' }, val: '5' });
    const { container } = render(<Live id="s1" />);
    expect(bySel(container, node('n2')).classList.contains('lv-changed')).toBe(true);
    expect(bySel(container, node('n1')).classList.contains('lv-changed')).toBe(false);
  });
});

describe('visibleTree', () => {
  it('returns the same structure when it is within the limit', () => {
    const t = tree(['1', '2', '3']);
    expect(visibleTree(t)).toBe(t);
  });

  it('trims to the BFS prefix, nulls links to hidden nodes and keeps every pointer', () => {
    const t = tree(Array.from({ length: 130 }, (_, i) => String(i)), [{ name: 'root', at: 'n1' }, { name: 'far', at: 'n130' }]);
    const v = visibleTree(t);
    expect(Object.keys(v.nodes)).toHaveLength(MAX_NODES);
    expect(v.nodes.n64.left).toBeNull();
    expect(v.ptrs).toBe(t.ptrs);
  });

  it('keeps going from the lowest id when every node has a parent', () => {
    // n130 is a leaf; pointing it back at the root leaves no node that nothing points to.
    const t = tree(Array.from({ length: 130 }, (_, i) => String(i)));
    t.nodes.n130 = { ...t.nodes.n130, left: 'n1' };
    const v = visibleTree(t);
    expect(Object.keys(v.nodes)).toHaveLength(MAX_NODES);
    expect(v.nodes.n1).toBeDefined();
    expect(v.nodes.n127).toBeDefined();
  });
});
