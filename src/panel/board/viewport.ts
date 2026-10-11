import type { Rect } from '../layout/place';
import type { View } from '../model/types';

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

// Screen = world * zoom + (x, y). Keep the world point under (cx, cy) where it is.
export function zoomAt(v: View, factor: number, cx: number, cy: number): View {
  const zoom = clampZoom(v.zoom * factor);
  const k = zoom / v.zoom;
  return { zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
}

export function fitView(rects: Rect[], w: number, h: number, pad = 16): View {
  if (!rects.length) return { x: 0, y: 0, zoom: 1 };
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  const zoom = clampZoom(Math.min(1, (w - 2 * pad) / (x1 - x0 || 1), (h - 2 * pad) / (y1 - y0 || 1)));
  return { zoom, x: pad - x0 * zoom, y: pad - y0 * zoom };
}
