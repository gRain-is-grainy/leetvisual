import { describe, expect, it } from 'vitest';
import { pushDown } from '../../../src/panel/layout/push';

const r = (x: number, y: number, w = 100, h = 60) => ({ x, y, w, h });

describe('pushDown', () => {
  it('moves nothing when no cards overlap, including cards that only touch', () => {
    expect(pushDown({ a: r(16, 16), b: r(16, 76), c: r(116, 16) }, ['a', 'b', 'c'])).toEqual({});
  });

  it('moves the lower of two overlapping cards to GAP below the upper one', () => {
    expect(pushDown({ a: r(16, 16, 100, 100), b: r(16, 92) }, ['a', 'b'])).toEqual({ b: { x: 16, y: 132 } });
  });

  it('cascades to a card under a moved card', () => {
    expect(pushDown({ a: r(16, 16, 100, 100), b: r(16, 92), c: r(16, 160) }, ['a', 'b', 'c'])).toEqual({
      b: { x: 16, y: 132 },
      c: { x: 16, y: 208 },
    });
  });

  it('moves the later card in order when two tops are level', () => {
    expect(pushDown({ b: r(16, 16), a: r(50, 16) }, ['a', 'b'])).toEqual({ b: { x: 16, y: 92 } });
  });

  it('only moves cards down, never sideways or up', () => {
    const rects = { a: r(16, 16, 300, 300), b: r(200, 100), c: r(16, 200) };
    const moved = pushDown(rects, ['a', 'b', 'c']);
    expect(Object.keys(moved).sort()).toEqual(['b', 'c']);
    for (const [id, p] of Object.entries(moved)) {
      expect(p.x).toBe(rects[id as 'b' | 'c'].x);
      expect(p.y).toBeGreaterThan(rects[id as 'b' | 'c'].y);
    }
  });

  it('leaves out cards that are not in the order', () => {
    expect(pushDown({ a: r(16, 16, 100, 100), b: r(16, 92) }, ['a'])).toEqual({});
  });
});
