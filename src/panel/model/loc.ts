import type { Board, Id, NodeId, Val } from './types';

export type Side = 'next' | 'left' | 'right';
export type Loc =
  | { s: Id; k: 'item'; i: number }
  | { s: Id; k: 'cell'; r: number; c: number }
  | { s: Id; k: 'node'; n: NodeId }
  | { s: Id; k: 'key'; i: number }
  | { s: Id; k: 'val'; i: number }
  | { s: Id; k: 'var' }
  | { s: Id; k: 'fn'; f: number }
  | { s: Id; k: 'local'; f: number; i: number }
  | { s: Id; k: 'lname'; f: number; i: number }
  | { s: Id; k: 'add' };
export type Sel =
  | { t: 'card'; s: Id }
  | { t: 'val'; at: Loc }
  | { t: 'ptr'; s: Id; name: string }
  | { t: 'link'; s: Id; n: NodeId; side: Side };
export type Src = Exclude<Sel, { t: 'card' }>;

function tuple(l: Loc): unknown[] {
  switch (l.k) {
    case 'item':
    case 'key':
    case 'val':
      return [l.s, l.k, l.i];
    case 'cell':
      return [l.s, l.k, l.r, l.c];
    case 'node':
      return [l.s, l.k, l.n];
    case 'fn':
      return [l.s, l.k, l.f];
    case 'local':
    case 'lname':
      return [l.s, l.k, l.f, l.i];
    case 'var':
    case 'add':
      return [l.s, l.k];
  }
}

const isIdx = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0;
const isText = (x: unknown): x is string => typeof x === 'string';

function fromTuple(t: unknown[]): Loc | null {
  const [s, k, a, b] = t;
  if (!isText(s)) return null;
  switch (k) {
    case 'item':
    case 'key':
    case 'val':
      return t.length === 3 && isIdx(a) ? { s, k, i: a } : null;
    case 'cell':
      return t.length === 4 && isIdx(a) && isIdx(b) ? { s, k, r: a, c: b } : null;
    case 'node':
      return t.length === 3 && isText(a) ? { s, k, n: a } : null;
    case 'fn':
      return t.length === 3 && isIdx(a) ? { s, k, f: a } : null;
    case 'local':
    case 'lname':
      return t.length === 4 && isIdx(a) && isIdx(b) ? { s, k, f: a, i: b } : null;
    case 'var':
    case 'add':
      return t.length === 2 ? { s, k } : null;
    default:
      return null;
  }
}

function parseTuple(k: string): unknown[] | null {
  try {
    const x: unknown = JSON.parse(k);
    return Array.isArray(x) ? x : null;
  } catch {
    return null;
  }
}

export function locKey(l: Loc): string {
  return JSON.stringify(tuple(l));
}

export function parseLoc(k: string): Loc | null {
  const t = parseTuple(k);
  return t && fromTuple(t);
}

export function selKey(s: Sel): string {
  switch (s.t) {
    case 'card':
      return JSON.stringify(['card', s.s]);
    case 'val':
      return JSON.stringify(['val', ...tuple(s.at)]);
    case 'ptr':
      return JSON.stringify(['ptr', s.s, s.name]);
    case 'link':
      return JSON.stringify(['link', s.s, s.n, s.side]);
  }
}

export function parseSel(k: string): Sel | null {
  const t = parseTuple(k);
  if (!t) return null;
  const [kind, s, a, b] = t;
  if (kind === 'val') {
    const at = fromTuple(t.slice(1));
    return at && { t: 'val', at };
  }
  if (!isText(s)) return null;
  if (kind === 'card' && t.length === 2) return { t: 'card', s };
  if (kind === 'ptr' && t.length === 3 && isText(a)) return { t: 'ptr', s, name: a };
  if (kind === 'link' && t.length === 4 && isText(a) && (b === 'next' || b === 'left' || b === 'right')) {
    return { t: 'link', s, n: a, side: b };
  }
  return null;
}

export function readVal(b: Board, at: Loc): Val | undefined {
  const s = Object.hasOwn(b.structs, at.s) ? b.structs[at.s] : undefined;
  if (!s) return undefined;
  switch (at.k) {
    case 'item':
      return s.kind === 'array' || s.kind === 'set' || s.kind === 'stack' || s.kind === 'queue'
        ? s.items[at.i]
        : undefined;
    case 'cell':
      return s.kind === 'grid' ? s.rows[at.r]?.[at.c] : undefined;
    case 'node':
      return (s.kind === 'list' || s.kind === 'tree') && Object.hasOwn(s.nodes, at.n) ? s.nodes[at.n].val : undefined;
    case 'key':
      return s.kind === 'map' ? s.entries[at.i]?.[0] : undefined;
    case 'val':
      return s.kind === 'map' ? s.entries[at.i]?.[1] : undefined;
    case 'var':
      return s.kind === 'var' ? s.value : undefined;
    case 'fn':
      return s.kind === 'calls' ? s.frames[at.f]?.fn : undefined;
    case 'local':
      return s.kind === 'calls' ? s.frames[at.f]?.locals[at.i]?.[1] : undefined;
    case 'lname':
      return s.kind === 'calls' ? s.frames[at.f]?.locals[at.i]?.[0] : undefined;
    case 'add':
      return undefined;
  }
}
