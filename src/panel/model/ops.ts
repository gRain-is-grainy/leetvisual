import { addChain, addTree } from './build';
import { nextId } from './ids';
import type { Loc, Side } from './loc';
import type {
  Board,
  Id,
  Kind,
  ListNode,
  ListS,
  NodeId,
  Ptr,
  PtrAt,
  PtrS,
  Structure,
  TreeNode,
  TreeS,
  Val,
} from './types';

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
    case 'cell': {
      if (s.kind !== 'grid' || !inRange(at.r, s.rows.length) || !inRange(at.c, s.rows[at.r].length)) return b;
      if (s.rows[at.r][at.c] === val) return b;
      return put(b, { ...s, rows: replace(s.rows, at.r, replace(s.rows[at.r], at.c, val)) });
    }
    case 'node': {
      if (s.kind === 'list' && Object.hasOwn(s.nodes, at.n) && s.nodes[at.n].val !== val) {
        return put(b, { ...s, nodes: { ...s.nodes, [at.n]: { ...s.nodes[at.n], val } } });
      }
      if (s.kind === 'tree' && Object.hasOwn(s.nodes, at.n) && s.nodes[at.n].val !== val) {
        return put(b, { ...s, nodes: { ...s.nodes, [at.n]: { ...s.nodes[at.n], val } } });
      }
      return b;
    }
    case 'fn': {
      const fn = val.trim();
      if (s.kind !== 'calls' || !fn || !inRange(at.f, s.frames.length) || s.frames[at.f].fn === fn) return b;
      return put(b, { ...s, frames: replace(s.frames, at.f, { ...s.frames[at.f], fn }) });
    }
    case 'local':
    case 'lname': {
      if (s.kind !== 'calls' || !inRange(at.f, s.frames.length)) return b;
      const frame = s.frames[at.f];
      if (!inRange(at.i, frame.locals.length)) return b;
      const [name, value] = frame.locals[at.i];
      let local: [string, Val];
      if (at.k === 'local') {
        if (value === val) return b;
        local = [name, val];
      } else {
        const to = val.trim();
        if (!to || frame.locals.some(([n]) => n === to)) return b;
        local = [to, value];
      }
      return put(b, { ...s, frames: replace(s.frames, at.f, { ...frame, locals: replace(frame.locals, at.i, local) }) });
    }
    case 'add':
      return b;
  }
}

function dropNode(b: Board, s: ListS | TreeS, n: NodeId): Board {
  if (!Object.hasOwn(s.nodes, n)) return b;
  const ptrs = s.ptrs.map((p) => (p.at === n ? { ...p, at: null } : p));
  if (s.kind === 'list') {
    const nodes: Record<NodeId, ListNode> = {};
    for (const [id, node] of Object.entries(s.nodes)) {
      if (id !== n) nodes[id] = node.next === n ? { ...node, next: null } : node;
    }
    return put(b, { ...s, nodes, ptrs });
  }
  const nodes: Record<NodeId, TreeNode> = {};
  const clear = (x: NodeId | null) => (x === n ? null : x);
  for (const [id, node] of Object.entries(s.nodes)) {
    if (id === n) continue;
    nodes[id] = node.left === n || node.right === n ? { ...node, left: clear(node.left), right: clear(node.right) } : node;
  }
  return put(b, { ...s, nodes, ptrs });
}

function link(b: Board, op: Extract<Op, { t: 'link' }>): Board {
  const s = get(b, op.s, ['list', 'tree']);
  if (!s || !Object.hasOwn(s.nodes, op.n) || (op.to !== null && !Object.hasOwn(s.nodes, op.to))) return b;
  if (s.kind === 'list') {
    const node = s.nodes[op.n];
    if (op.side !== 'next' || node.next === op.to) return b;
    return put(b, { ...s, nodes: { ...s.nodes, [op.n]: { ...node, next: op.to } } });
  }
  const node = s.nodes[op.n];
  if (op.side === 'next' || node[op.side] === op.to) return b;
  const changed = op.side === 'left' ? { ...node, left: op.to } : { ...node, right: op.to };
  return put(b, { ...s, nodes: { ...s.nodes, [op.n]: changed } });
}

const PTR_KINDS = ['array', 'grid', 'list', 'tree'] as const;

function validAt(s: PtrS, at: PtrAt): boolean {
  if (at === null) return true;
  switch (s.kind) {
    case 'array':
      return typeof at === 'number' && inRange(at, s.items.length);
    case 'grid':
      return Array.isArray(at) && inRange(at[0], s.rows.length) && inRange(at[1], s.rows[at[0]].length);
    case 'list':
    case 'tree':
      return typeof at === 'string' && Object.hasOwn(s.nodes, at);
  }
}

const sameAt = (a: PtrAt, c: PtrAt) =>
  Array.isArray(a) && Array.isArray(c) ? a[0] === c[0] && a[1] === c[1] : a === c;

function movePtr(b: Board, id: Id, name: string, at: PtrAt): Board {
  const s = get(b, id, PTR_KINDS);
  const n = name.trim();
  if (!s || !n || !validAt(s, at)) return b;
  const i = s.ptrs.findIndex((p) => p.name === n);
  if (i >= 0 && sameAt(s.ptrs[i].at, at)) return b;
  const ptr: Ptr = { name: n, at };
  return put(b, { ...s, ptrs: i >= 0 ? replace(s.ptrs, i, ptr) : [...s.ptrs, ptr] });
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
    case 'node':
      return s.kind === 'list' || s.kind === 'tree' ? dropNode(b, s, at.n) : b;
    case 'local':
    case 'lname': {
      if (s.kind !== 'calls' || !inRange(at.f, s.frames.length)) return b;
      const frame = s.frames[at.f];
      if (!inRange(at.i, frame.locals.length)) return b;
      return put(b, { ...s, frames: replace(s.frames, at.f, { ...frame, locals: without(frame.locals, at.i) }) });
    }
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
    case 'mark': {
      const s = get(b, op.s, ['grid']);
      if (!s || !inRange(op.r, s.rows.length) || !inRange(op.c, s.rows[op.r].length)) return b;
      const key = `${op.r},${op.c}`;
      const marked = s.marked.includes(key) ? s.marked.filter((m) => m !== key) : [...s.marked, key];
      return put(b, { ...s, marked });
    }
    case 'link':
      return link(b, op);
    case 'node': {
      const s = get(b, op.s, ['list', 'tree']);
      if (!s) return b;
      const id = newNodeId(s);
      if (s.kind === 'list') return put(b, { ...s, nodes: { ...s.nodes, [id]: { val: op.val, next: null } } });
      return put(b, { ...s, nodes: { ...s.nodes, [id]: { val: op.val, left: null, right: null } } });
    }
    case 'ptr':
      return movePtr(b, op.s, op.name, op.at);
    case 'renamePtr': {
      const s = get(b, op.s, PTR_KINDS);
      const to = op.to.trim();
      if (!s || !to || !s.ptrs.some((p) => p.name === op.name) || s.ptrs.some((p) => p.name === to)) return b;
      return put(b, { ...s, ptrs: s.ptrs.map((p) => (p.name === op.name ? { ...p, name: to } : p)) });
    }
    case 'unptr': {
      const s = get(b, op.s, PTR_KINDS);
      if (!s || !s.ptrs.some((p) => p.name === op.name)) return b;
      return put(b, { ...s, ptrs: s.ptrs.filter((p) => p.name !== op.name) });
    }
    case 'call': {
      const s = get(b, op.s, ['calls']);
      if (!s) return b;
      const top = s.frames.at(-1);
      const locals = top ? top.locals.map(([n]): [string, Val] => [n, '']) : [];
      return put(b, { ...s, frames: [...s.frames, { fn: top ? top.fn : 'f', locals }] });
    }
    case 'ret': {
      const s = get(b, op.s, ['calls']);
      return s && s.frames.length ? put(b, { ...s, frames: s.frames.slice(0, -1) }) : b;
    }
    case 'local': {
      const s = get(b, op.s, ['calls']);
      const name = op.name.trim();
      if (!s || !name || !inRange(op.f, s.frames.length)) return b;
      const frame = s.frames[op.f];
      if (frame.locals.some(([n]) => n === name)) return b;
      return put(b, { ...s, frames: replace(s.frames, op.f, { ...frame, locals: [...frame.locals, [name, '']] }) });
    }
    case 'popTo': {
      const s = get(b, op.s, ['stack']);
      if (!s || s.items.length === 0) return b;
      const popped = put(b, { ...s, items: s.items.slice(0, -1) });
      return op.to ? putVal(popped, s.items[s.items.length - 1], op.to) : popped;
    }
    case 'rebuild': {
      const s = get(b, op.s, ['array']);
      if (!s) return b;
      if (op.as === 'list') {
        const nodes: Record<NodeId, ListNode> = {};
        const head = addChain(nodes, s.items);
        return put(b, { id: s.id, name: s.name, kind: 'list', nodes, ptrs: [{ name: s.name, at: head }] });
      }
      const nodes: Record<NodeId, TreeNode> = {};
      const root = addTree(nodes, s.items);
      return put(b, { id: s.id, name: s.name, kind: 'tree', nodes, ptrs: [{ name: s.name, at: root }] });
    }
  }
}

export function newNodeId(s: ListS | TreeS): NodeId {
  return nextId('n', Object.keys(s.nodes));
}

const PTR_NAMES = ['i', 'j', 'k', 'l', 'r', 'm', 'p', 'q'];

export function freePtrName(ptrs: Ptr[]): string {
  const used = new Set(ptrs.map((p) => p.name));
  const free = PTR_NAMES.find((n) => !used.has(n));
  if (free) return free;
  let k = 2;
  while (used.has('p' + k)) k++;
  return 'p' + k;
}

export function putVal(b: Board, val: Val, to: Loc): Board {
  if (to.k !== 'add') return apply(b, { t: 'set', at: to, val });
  const s = find(b, to.s);
  if (s?.kind === 'map') return apply(b, { t: 'putKey', s: to.s, key: val });
  if (s?.kind === 'set' || s?.kind === 'stack' || s?.kind === 'queue') return apply(b, { t: 'push', s: to.s, val });
  return b;
}
