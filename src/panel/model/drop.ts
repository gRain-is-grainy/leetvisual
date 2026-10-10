import { locKey, readVal, type Loc, type Sel, type Src } from './loc';
import type { Op } from './ops';
import type { Board, PtrAt, Val } from './types';

const COPY: ReadonlySet<Loc['k']> = new Set(['item', 'cell', 'node', 'key', 'val', 'var', 'local']);

function find(b: Board, id: string) {
  return Object.hasOwn(b.structs, id) ? b.structs[id] : undefined;
}

function isStackTop(b: Board, at: Loc): boolean {
  const s = find(b, at.s);
  return at.k === 'item' && s?.kind === 'stack' && at.i === s.items.length - 1;
}

function valueOp(b: Board, from: Loc, to: Loc, val: Val): Op | null {
  const t = find(b, to.s);
  if (!t) return null;
  if (from.k === 'item' && to.k === 'item' && from.s === to.s && t.kind === 'array') {
    return t.items[to.i] === undefined ? null : { t: 'swap', s: to.s, i: from.i, j: to.i };
  }
  if (to.k === 'add') {
    if (to.s === from.s) return null;
    if (t.kind === 'set' || t.kind === 'stack' || t.kind === 'queue') return { t: 'push', s: to.s, val };
    return t.kind === 'map' ? { t: 'putKey', s: to.s, key: val } : null;
  }
  if (!COPY.has(to.k) || (to.k === 'item' && t.kind !== 'array') || readVal(b, to) === undefined) return null;
  return { t: 'set', at: to, val };
}

export function resolveDrop(b: Board, src: Src, to: Loc | null): Op | null {
  if (src.t === 'val') {
    const val = readVal(b, src.at);
    if (val === undefined) return null;
    if (isStackTop(b, src.at)) {
      if (to === null) return { t: 'pop', s: src.at.s };
      if (to.s === src.at.s) return null;
      return valueOp(b, src.at, to, val) ? { t: 'popTo', s: src.at.s, to } : null;
    }
    if (to === null || locKey(to) === locKey(src.at)) return null;
    return valueOp(b, src.at, to, val);
  }
  const s = find(b, src.s);
  if (src.t === 'link') {
    if (!s || (s.kind !== 'list' && s.kind !== 'tree') || !Object.hasOwn(s.nodes, src.n)) return null;
    if ((s.kind === 'list') !== (src.side === 'next')) return null;
    if (to === null) return { t: 'link', s: src.s, n: src.n, side: src.side, to: null };
    if (to.k !== 'node' || to.s !== src.s || !Object.hasOwn(s.nodes, to.n)) return null;
    return { t: 'link', s: src.s, n: src.n, side: src.side, to: to.n };
  }
  if (!s || !('ptrs' in s) || !s.ptrs.some((p) => p.name === src.name)) return null;
  const ptr = (at: PtrAt): Op => ({ t: 'ptr', s: src.s, name: src.name, at });
  if (to === null || to.s !== src.s) return ptr(null);
  if (to.k === 'item' && s.kind === 'array') return ptr(to.i);
  if (to.k === 'cell' && s.kind === 'grid') return ptr([to.r, to.c]);
  if (to.k === 'node' && (s.kind === 'list' || s.kind === 'tree')) return ptr(to.n);
  return null;
}

export function deleteOp(b: Board, sel: Sel): Op | null {
  if (sel.t === 'card') return find(b, sel.s) ? { t: 'remove', s: sel.s } : null;
  if (sel.t === 'link') return null;
  if (sel.t === 'ptr') {
    const s = find(b, sel.s);
    return s && 'ptrs' in s && s.ptrs.some((p) => p.name === sel.name) ? { t: 'unptr', s: sel.s, name: sel.name } : null;
  }
  const { at } = sel;
  const s = find(b, at.s);
  if (!s || readVal(b, at) === undefined) return null;
  switch (at.k) {
    case 'item':
      if (s.kind === 'set') return { t: 'del', at };
      if ((s.kind === 'array' || s.kind === 'stack') && at.i === s.items.length - 1) return { t: 'pop', s: at.s };
      if (s.kind === 'queue' && at.i === 0) return { t: 'shift', s: at.s };
      return null;
    case 'key':
    case 'val':
    case 'node':
    case 'local':
    case 'lname':
      return { t: 'del', at };
    default:
      return null;
  }
}

export function canEdit(b: Board, sel: Sel): boolean {
  if (sel.t === 'card') return find(b, sel.s) !== undefined;
  if (sel.t === 'link') return false;
  if (sel.t === 'ptr') {
    const s = find(b, sel.s);
    return !!s && 'ptrs' in s && s.ptrs.some((p) => p.name === sel.name);
  }
  return readVal(b, sel.at) !== undefined;
}

export function srcLabel(b: Board, src: Src): string {
  if (src.t === 'val') return readVal(b, src.at) ?? '';
  return src.t === 'ptr' ? src.name : src.side;
}
