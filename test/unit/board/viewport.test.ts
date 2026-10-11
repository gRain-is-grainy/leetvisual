import { describe, expect, it } from 'vitest';
import { clampZoom, fitView, zoomAt } from '../../../src/panel/board/viewport';

describe('zoomAt', () => {
  it('keeps the world point under the cursor fixed', () => {
    const v = zoomAt({ x: 10, y: 20, zoom: 1 }, 2, 110, 70);
    expect(v.zoom).toBe(2);
    expect((110 - v.x) / v.zoom).toBeCloseTo(100);
    expect((70 - v.y) / v.zoom).toBeCloseTo(50);
  });

  it('clamps to 25% and 200%', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 10, 0, 0).zoom).toBe(2);
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, 0.01, 0, 0).zoom).toBe(0.25);
    expect(clampZoom(1.3)).toBe(1.3);
  });
});

describe('fitView', () => {
  it('returns the identity view when there are no cards', () => {
    expect(fitView([], 800, 600)).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('fits every card inside the viewport with padding and never zooms past 100%', () => {
    const rects = [
      { x: 100, y: 100, w: 100, h: 50 },
      { x: 300, y: 400, w: 200, h: 100 },
    ];
    const v = fitView(rects, 800, 600);
    expect(v.zoom).toBe(1);
    for (const r of rects) {
      expect(r.x * v.zoom + v.x).toBeGreaterThanOrEqual(16);
      expect(r.y * v.zoom + v.y).toBeGreaterThanOrEqual(16);
      expect((r.x + r.w) * v.zoom + v.x).toBeLessThanOrEqual(800 - 16);
      expect((r.y + r.h) * v.zoom + v.y).toBeLessThanOrEqual(600 - 16);
    }
  });

  it('shrinks a large board but not below 25%', () => {
    expect(fitView([{ x: 0, y: 0, w: 1536, h: 100 }], 800, 600).zoom).toBeCloseTo(0.5);
    expect(fitView([{ x: 0, y: 0, w: 100000, h: 100 }], 800, 600).zoom).toBe(0.25);
  });
});
