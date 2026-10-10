import type { Structure } from '../model/types';

export const MAX_ITEMS = 200;
export const MAX_NODES = 127;
export const MAX_GRID = 30;

export function isLarge(s: Structure): boolean {
  switch (s.kind) {
    case 'array':
    case 'set':
    case 'stack':
    case 'queue':
      return s.items.length > MAX_ITEMS;
    case 'grid':
      return s.rows.length > MAX_GRID || s.rows.some((r) => r.length > MAX_GRID);
    case 'list':
      return Object.keys(s.nodes).length > MAX_ITEMS;
    case 'tree':
      return Object.keys(s.nodes).length > MAX_NODES;
    case 'map':
      return s.entries.length > MAX_ITEMS;
    default:
      return false;
  }
}
