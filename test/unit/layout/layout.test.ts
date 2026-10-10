import { describe, expect, it } from 'vitest';
import { layoutList } from '../../../src/panel/layout/list';
import { GAP, place, stack, type Rect } from '../../../src/panel/layout/place';
import { layoutTree } from '../../../src/panel/layout/tree';
import type { ListNode, Ptr, TreeNode } from '../../../src/panel/model/types';
import { list, tree } from '../../helpers/boards';

const tn = (left: string | null = null, right: string | null = null): TreeNode => ({ val: '0', left, right });
const ln = (next: string | null = null): ListNode => ({ val: '0', next });

describe('layoutTree', () => {
  it('lays out an empty tree', () => {
    expect(layoutTree(tree('s1', {}))).toEqual({ pos: {}, cols: 0, rows: 0, back: [] });
  });

  it('lays out a single node', () => {
    expect(layoutTree(tree('s1', { n1: tn() }))).toEqual({ pos: { n1: { x: 0, y: 0 } }, cols: 1, rows: 1, back: [] });
  });

  it('uses in-order position for x and depth for y', () => {
    const t = tree('s1', { n1: tn('n2', 'n3'), n2: tn(null, 'n4'), n3: tn(), n4: tn() });
    expect(layoutTree(t).pos).toEqual({ n2: { x: 0, y: 1 }, n4: { x: 1, y: 2 }, n1: { x: 2, y: 0 }, n3: { x: 3, y: 1 } });
  });

  it('handles left- and right-skewed trees', () => {
    const left = tree('s1', { n1: tn('n2'), n2: tn('n3'), n3: tn() });
    expect(layoutTree(left).pos).toEqual({ n3: { x: 0, y: 2 }, n2: { x: 1, y: 1 }, n1: { x: 2, y: 0 } });
    const right = tree('s1', { n1: tn(null, 'n2'), n2: tn(null, 'n3'), n3: tn() });
    expect(layoutTree(right).pos).toEqual({ n1: { x: 0, y: 0 }, n2: { x: 1, y: 1 }, n3: { x: 2, y: 2 } });
  });

  it('puts pointer-targeted roots first, then detached subtrees by id, side by side', () => {
    const ptrs: Ptr[] = [{ name: 'q', at: 'n5' }, { name: 'p', at: 'n1' }];
    const t = tree('s1', { n1: tn('n2'), n2: tn(), n3: tn(), n5: tn() }, { ptrs });
    const { pos, cols, rows } = layoutTree(t);
    expect(pos).toEqual({ n5: { x: 0, y: 0 }, n2: { x: 1, y: 1 }, n1: { x: 2, y: 0 }, n3: { x: 3, y: 0 } });
    expect([cols, rows]).toEqual([4, 2]);
  });

  it('reports an edge back to an ancestor and still terminates', () => {
    const t = tree('s1', { n1: tn('n2'), n2: tn(null, 'n1') });
    expect(layoutTree(t)).toEqual({ pos: { n2: { x: 0, y: 1 }, n1: { x: 1, y: 0 } }, cols: 2, rows: 2, back: [['n2', 'n1']] });
  });

  it('lays out a pure cycle starting at the lowest id', () => {
    const t = tree('s1', { n2: tn('n1'), n1: tn('n2') });
    expect(layoutTree(t)).toMatchObject({ pos: { n2: { x: 0, y: 1 }, n1: { x: 1, y: 0 } }, back: [['n2', 'n1']] });
  });

  it('lays out a 10,000-deep tree without recursion', () => {
    const nodes: Record<string, TreeNode> = {};
    for (let i = 1; i <= 10000; i++) nodes['n' + i] = tn(i < 10000 ? 'n' + (i + 1) : null);
    const { rows, cols } = layoutTree(tree('s1', nodes));
    expect([rows, cols]).toEqual([10000, 10000]);
  });
});

describe('layoutList', () => {
  it('lays out several chains as rows, pointer heads first', () => {
    const l = list('s1', { n1: ln('n2'), n2: ln(), n3: ln('n4'), n4: ln() }, { ptrs: [{ name: 'b', at: 'n3' }] });
    expect(layoutList(l)).toEqual({
      pos: { n3: { x: 0, y: 0 }, n4: { x: 1, y: 0 }, n1: { x: 0, y: 1 }, n2: { x: 1, y: 1 } },
      rows: [['n3', 'n4'], ['n1', 'n2']],
      cols: 2,
    });
  });

  it('lays out an empty list', () => {
    expect(layoutList(list('s1', {}))).toEqual({ pos: {}, rows: [], cols: 0 });
  });

  it('starts a pure cycle at the lowest id', () => {
    const l = list('s1', { n3: ln('n1'), n1: ln('n2'), n2: ln('n3') });
    expect(layoutList(l).rows).toEqual([['n1', 'n2', 'n3']]);
  });

  it('stops a tail cycle at the first repeated node', () => {
    const l = list('s1', { n1: ln('n2'), n2: ln('n3'), n3: ln('n4'), n4: ln('n2') }, { ptrs: [{ name: 'head', at: 'n1' }] });
    expect(layoutList(l).rows).toEqual([['n1', 'n2', 'n3', 'n4']]);
  });

  it('gives a second head that merges into the first chain its own short row', () => {
    const l = list('s1', { n1: ln('n3'), n2: ln('n3'), n3: ln() }, { ptrs: [{ name: 'a', at: 'n1' }, { name: 'b', at: 'n2' }] });
    expect(layoutList(l).rows).toEqual([['n1', 'n3'], ['n2']]);
  });

  it('puts detached nodes on rows of their own', () => {
    const l = list('s1', { n1: ln('n2'), n2: ln(), n9: ln() }, { ptrs: [{ name: 'head', at: 'n1' }] });
    expect(layoutList(l).rows).toEqual([['n1', 'n2'], ['n9']]);
  });
});

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('place', () => {
  it('starts at the top left', () => {
    expect(place([], { w: 100, h: 50 }, 800)).toEqual({ x: GAP, y: GAP });
  });

  it('goes to the right of the first card, then wraps below at maxW', () => {
    const a: Rect = { x: GAP, y: GAP, w: 200, h: 100 };
    expect(place([a], { w: 100, h: 50 }, 800)).toEqual({ x: GAP + 200 + GAP, y: GAP });
    expect(place([a], { w: 100, h: 50 }, 300)).toEqual({ x: GAP, y: GAP + 100 + GAP });
  });

  it('places a card wider than the board at the left edge below everything', () => {
    const a: Rect = { x: GAP, y: GAP, w: 200, h: 100 };
    expect(place([a], { w: 2000, h: 50 }, 600)).toEqual({ x: GAP, y: GAP + 100 + GAP });
  });

  it('never overlaps existing cards, even ones the user dragged on top of each other', () => {
    const rand = rng(42);
    for (let run = 0; run < 200; run++) {
      const rects: Rect[] = [];
      const maxW = 300 + rand() * 1500;
      for (let i = 0; i < 12; i++) {
        const size = { w: 20 + rand() * 400, h: 20 + rand() * 300 };
        const p = place(rects, size, maxW);
        for (const other of rects) expect(overlaps({ ...p, ...size }, other)).toBe(false);
        // About a third of the cards land wherever the user dragged them, overlaps included.
        rects.push(rand() < 0.3 ? { x: rand() * 900 - 100, y: rand() * 900 - 100, ...size } : { ...p, ...size });
      }
    }
  });
});

describe('stack', () => {
  it('stacks cards top to bottom in order, GAP apart', () => {
    expect(stack([{ w: 10, h: 100 }, { w: 300, h: 40 }, { w: 5, h: 5 }])).toEqual([
      { x: GAP, y: GAP },
      { x: GAP, y: GAP + 100 + GAP },
      { x: GAP, y: GAP + 100 + GAP + 40 + GAP },
    ]);
  });

  it('returns nothing for no cards', () => {
    expect(stack([])).toEqual([]);
  });
});
