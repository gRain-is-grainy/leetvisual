import type { Loc, Side } from './loc';
import type { Board, Id, Kind, NodeId, PtrAt, Structure, Val } from './types';

export type Op =
  | { t: 'add'; struct: Structure }
  | { t: 'remove'; s: Id }
  | { t: 'rename'; s: Id; name: string }
  | { t: 'set'; at: Loc; val: Val }
  | { t: 'swap'; s: Id; i: number; j: number }
  | { t: 'push'; s: Id; val: Val }
  | { t: 'pop'; s: Id }
  | { t: 'shift'; s: Id }
  | { t: 'del'; at: Loc }
  | { t: 'mark'; s: Id; r: number; c: number }
  | { t: 'link'; s: Id; n: NodeId; side: Side; to: NodeId | null }
  | { t: 'node'; s: Id; val: Val }
  | { t: 'putKey'; s: Id; key: Val }
  | { t: 'ptr'; s: Id; name: string; at: PtrAt }
  | { t: 'renamePtr'; s: Id; name: string; to: string }
  | { t: 'unptr'; s: Id; name: string }
  | { t: 'call'; s: Id }
  | { t: 'ret'; s: Id }
  | { t: 'local'; s: Id; f: number; name: string }
  | { t: 'popTo'; s: Id; to: Loc | null }
  | { t: 'rebuild'; s: Id; as: 'list' | 'tree' };

type Of<K extends Kind> = Structure & { kind: K };

function find(b: Board, id: Id): Structure | undefined {
  return Object.hasOwn(b.structs, id) ? b.structs[id] : undefined;
}

function get<K extends Kind>(b: Board, id: Id, kinds: readonly K[]): Of<K> | undefined {
  const s = find(b, id);
  return s && (kinds as readonly Kind[]).includes(s.kind) ? (s as Of<K>) : undefined;
}

function put(b: Board, s: Structure): Board {
  return { structs: { ...b.structs, [s.id]: s } };
}

const inRange = (i: number, n: number) => Number.isInteger(i) && i >= 0 && i < n;

function replace<T>(xs: T[], i: number, x: T): T[] {
  const out = xs.slice();
  out[i] = x;
  return out;
}

function without<T>(xs: T[], i: number): T[] {
  return xs.filter((_, j) => j !== i);
}

function popArray(b: Board, id: Id): Board {
  const s = get(b, id, ['array']);
  if (!s || s.items.length === 0) return b;
  const last = s.items.length - 1;
  const ptrs = s.ptrs.map((p) => (p.at === last ? { ...p, at: last > 0 ? last - 1 : null } : p));
  return put(b, { ...s, items: s.items.slice(0, last), ptrs });
}

function setVal(b: Board, at: Loc, val: Val): Board {
  const s = find(b, at.s);
  if (!s) return b;
  switch (at.k) {
    case 'item': {
      if (s.kind !== 'array' && s.kind !== 'set' && s.kind !== 'stack' && s.kind !== 'queue') return b;
      if (!inRange(at.i, s.items.length) || s.items[at.i] === val) return b;
      if (s.kind === 'set' && s.items.includes(val)) return b;
      return put(b, { ...s, items: replace(s.items, at.i, val) });
    }
    case 'key':
    case 'val': {
      if (s.kind !== 'map' || !inRange(at.i, s.entries.length)) return b;
      const [k, v] = s.entries[at.i];
      if (at.k === 'val') return v === val ? b : put(b, { ...s, entries: replace(s.entries, at.i, [k, val]) });
      if (s.entries.some(([x]) => x === val)) return b;
      return put(b, { ...s, entries: replace(s.entries, at.i, [val, v]) });
    }
    case 'var':
      return s.kind === 'var' && s.value !== val ? put(b, { ...s, value: val }) : b;
    default:
      return b;
  }
}

function delAt(b: Board, at: Loc): Board {
  const s = find(b, at.s);
  if (!s) return b;
  switch (at.k) {
    case 'item':
      if (s.kind === 'set' && inRange(at.i, s.items.length)) return put(b, { ...s, items: without(s.items, at.i) });
      if (s.kind === 'array' && at.i === s.items.length - 1) return popArray(b, s.id);
      return b;
    case 'key':
    case 'val':
      return s.kind === 'map' && inRange(at.i, s.entries.length)
        ? put(b, { ...s, entries: without(s.entries, at.i) })
        : b;
    default:
      return b;
  }
}

export function apply(b: Board, op: Op): Board {
  switch (op.t) {
    case 'add':
      return find(b, op.struct.id) ? b : put(b, op.struct);
    case 'remove': {
      if (!find(b, op.s)) return b;
      const structs = { ...b.structs };
      delete structs[op.s];
      return { structs };
    }
    case 'rename': {
      const s = find(b, op.s);
      const name = op.name.trim();
      return s && name && name !== s.name ? put(b, { ...s, name }) : b;
    }
    case 'set':
      return setVal(b, op.at, op.val);
    case 'swap': {
      const s = get(b, op.s, ['array']);
      if (!s || op.i === op.j || !inRange(op.i, s.items.length) || !inRange(op.j, s.items.length)) return b;
      const items = s.items.slice();
      [items[op.i], items[op.j]] = [items[op.j], items[op.i]];
      return put(b, { ...s, items });
    }
    case 'push': {
      const s = get(b, op.s, ['array', 'set', 'stack', 'queue']);
      if (!s || (s.kind === 'set' && s.items.includes(op.val))) return b;
      return put(b, { ...s, items: [...s.items, op.val] });
    }
    case 'pop': {
      const s = get(b, op.s, ['stack']);
      if (!s) return popArray(b, op.s);
      return s.items.length ? put(b, { ...s, items: s.items.slice(0, -1) }) : b;
    }
    case 'shift': {
      const s = get(b, op.s, ['queue']);
      return s && s.items.length ? put(b, { ...s, items: s.items.slice(1) }) : b;
    }
    case 'del':
      return delAt(b, op.at);
    case 'putKey': {
      const s = get(b, op.s, ['map']);
      if (!s || s.entries.some(([k]) => k === op.key)) return b;
      return put(b, { ...s, entries: [...s.entries, [op.key, '']] });
    }
    default:
      return b;
  }
}

export function putVal(b: Board, val: Val, to: Loc): Board {
  if (to.k !== 'add') return apply(b, { t: 'set', at: to, val });
  const s = find(b, to.s);
  if (s?.kind === 'map') return apply(b, { t: 'putKey', s: to.s, key: val });
  if (s?.kind === 'set' || s?.kind === 'stack' || s?.kind === 'queue') return apply(b, { t: 'push', s: to.s, val });
  return b;
}
