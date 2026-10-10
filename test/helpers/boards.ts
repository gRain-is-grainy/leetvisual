import type { ArrayS, BagS, Board, CallsS, GridS, ListS, MapS, Structure, TreeS, VarS } from '../../src/panel/model/types';

export function board(...structs: Structure[]): Board {
  return deepFreeze({ structs: Object.fromEntries(structs.map((s) => [s.id, s])) });
}

export function deepFreeze<T>(x: T): T {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x)) deepFreeze(v);
  }
  return x;
}

export const arr = (id: string, items: string[], extra: Partial<ArrayS> = {}): ArrayS => ({
  id, name: id, kind: 'array', items, ptrs: [], ...extra,
});
export const grid = (id: string, rows: string[][], extra: Partial<GridS> = {}): GridS => ({
  id, name: id, kind: 'grid', rows, marked: [], ptrs: [], ...extra,
});
export const list = (id: string, nodes: ListS['nodes'], extra: Partial<ListS> = {}): ListS => ({
  id, name: id, kind: 'list', nodes, ptrs: [], ...extra,
});
export const tree = (id: string, nodes: TreeS['nodes'], extra: Partial<TreeS> = {}): TreeS => ({
  id, name: id, kind: 'tree', nodes, ptrs: [], ...extra,
});
export const map = (id: string, entries: [string, string][]): MapS => ({ id, name: id, kind: 'map', entries });
export const bag = (id: string, kind: BagS['kind'], items: string[]): BagS => ({ id, name: id, kind, items });
export const v = (id: string, value: string): VarS => ({ id, name: id, kind: 'var', value });
export const calls = (id: string, frames: CallsS['frames']): CallsS => ({ id, name: id, kind: 'calls', frames });
