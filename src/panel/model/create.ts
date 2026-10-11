import type { Board, Id, Kind, Structure, Val } from './types';

export type CreateOpts = { length?: number; rows?: number; cols?: number; fill?: Val };

export const DEFAULT_NAMES: Record<Kind, string> = {
  var: 'x', array: 'arr', grid: 'grid', map: 'map', set: 'set',
  stack: 'stack', queue: 'queue', list: 'list', tree: 'tree', calls: 'calls',
};

export function uniqueName(base: string, board: Board): string {
  const used = new Set(Object.values(board.structs).map((s) => s.name));
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}${i}`)) return `${base}${i}`;
}

function count(v: number | undefined, min: number, def: number): number {
  return v === undefined || !Number.isFinite(v) ? def : Math.max(min, Math.floor(v));
}

export function createStruct(kind: Kind, opts: CreateOpts, id: Id, name: string): Structure {
  const fill = (opts.fill ?? '0').trim();
  switch (kind) {
    case 'var':
      return { id, name, kind, value: '' };
    case 'array':
      return { id, name, kind, items: Array.from({ length: count(opts.length, 0, 5) }, () => fill), ptrs: [] };
    case 'grid': {
      const cols = count(opts.cols, 1, 3);
      const rows = Array.from({ length: count(opts.rows, 1, 3) }, () => Array.from({ length: cols }, () => fill));
      return { id, name, kind, rows, marked: [], ptrs: [] };
    }
    case 'map':
      return { id, name, kind, entries: [] };
    case 'set':
    case 'stack':
    case 'queue':
      return { id, name, kind, items: [] };
    case 'list':
      return { id, name, kind, nodes: {}, ptrs: [{ name: 'head', at: null }] };
    case 'tree':
      return { id, name, kind, nodes: {}, ptrs: [{ name: 'root', at: null }] };
    case 'calls':
      return { id, name, kind, frames: [{ fn: 'f', locals: [] }] };
  }
}
