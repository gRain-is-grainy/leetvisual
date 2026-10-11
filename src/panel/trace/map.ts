import type { ArrayS, Board, CallsS, GridS, Id, ListNode, ListS, NodeId, Ptr, Structure, TreeNode, TreeS, Val } from '../model/types';
import { isStr, splitChars } from '../parse/tokens';
import { MAX_ITEMS, MAX_NODES } from '../views/limits';
import type { RFacts, RObj, RTrace, RVal } from './raw';
import type { SFrame, State } from './replay';
import type { TraceInfo } from './scan';
import { shortName, textOf } from './text';

export type MapCtx = { raw: RTrace; info: TraceInfo; k: number; last: boolean };

export const MAX_LIST_NODES = 200;
export const MAX_TREE_NODES = MAX_NODES;

type Heap = Map<number, RObj>;
type Obj = Extract<RObj, ['OBJ', ...unknown[]]>;
type NodeKind = 'list' | 'tree';

const NO_FACTS: RFacts = { cursors: [], grids: [], strs: [] };
const INT = /^-?\d+$/;
const CURSOR_LIMIT = 2 ** 31;

const isRef = (v: RVal | undefined): v is ['R', number] => Array.isArray(v);
const rest = (o: RObj): RVal[] => o.slice(1) as RVal[];
const itemText = (v: RVal, heap: Heap): Val => (typeof v === 'string' ? v : textOf(v, heap));

function nodeKind(v: RVal, heap: Heap): NodeKind | undefined {
  const tag = isRef(v) ? heap.get(v[1])?.[0] : undefined;
  return tag === 'LNODE' ? 'list' : tag === 'TNODE' ? 'tree' : undefined;
}

// A frame's locals in its code object's order; names the frame does not list go last, in the order they were bound.
// Implicit locals such as a generator expression's `.0` iterator can never be user identifiers, so they are left out.
function ordered(f: SFrame): [string, RVal][] {
  const rank = (n: string) => {
    const i = f.names.indexOf(n);
    return i < 0 ? f.names.length : i;
  };
  return [...f.locals].filter(([n]) => !n.startsWith('.')).sort((a, b) => rank(a[0]) - rank(b[0]));
}

// The current frame's variables: `self` holding an object becomes its fields, named self.<field>, in its place.
function named(f: SFrame, heap: Heap): [string, RVal][] {
  const out: [string, RVal][] = [];
  for (const [name, v] of ordered(f)) {
    const o = name === 'self' && isRef(v) ? heap.get(v[1]) : undefined;
    if (o?.[0] === 'OBJ') for (const [field, fv] of (o as Obj)[2]) out.push([`self.${field}`, fv]);
    else out.push([name, v]);
  }
  return out;
}

// Spec §5.4's type map.
function card(id: Id, name: string, v: RVal, heap: Heap, chars: boolean): Structure {
  if (typeof v === 'string') {
    return chars && isStr(v) ? { id, name, kind: 'array', items: splitChars(v), ptrs: [], chars: true } : { id, name, kind: 'var', value: v };
  }
  const o = heap.get(v[1]);
  if (o?.[0] === 'LIST') {
    const items = rest(o);
    const rows = items.map((i) => (isRef(i) ? heap.get(i[1]) : undefined));
    if (items.length && rows.every((r) => r?.[0] === 'LIST')) {
      return { id, name, kind: 'grid', rows: rows.map((r) => rest(r!).map((c) => itemText(c, heap))), marked: [], ptrs: [] };
    }
    return { id, name, kind: 'array', items: items.map((i) => itemText(i, heap)), ptrs: [] };
  }
  if (o?.[0] === 'DICT') {
    const entries = (o.slice(1) as [RVal, RVal][]).map(([a, b]): [Val, Val] => [itemText(a, heap), itemText(b, heap)]);
    return { id, name, kind: 'map', entries };
  }
  if (o?.[0] === 'SET' || o?.[0] === 'DEQUE') {
    return { id, name, kind: o[0] === 'SET' ? 'set' : 'queue', items: rest(o).map((i) => itemText(i, heap)) };
  }
  return { id, name, kind: 'var', value: textOf(v, heap) };
}

// A variable that is a pointer on a pool (spec §5.3): a node, or a pointer variable holding None or a reference with no heap entry.
function ptrOf(name: string, v: RVal, heap: Heap, info: TraceInfo): { kind: NodeKind; at: NodeId | null } | null {
  const own = nodeKind(v, heap);
  if (own) return { kind: own, at: `n${(v as ['R', number])[1]}` };
  const kind = info.ptrVars.get(name);
  if (!kind) return null;
  if (v === 'None') return { kind, at: null };
  if (isRef(v) && !heap.has(v[1])) return { kind, at: `n${v[1]}` };
  return null;
}

function intOf(v: RVal | undefined): number | null {
  if (typeof v !== 'string' || !INT.test(v)) return null;
  const n = Number(v);
  return Math.abs(n) < CURSOR_LIMIT ? n : null;
}

// Spec §5.5 with Decision 10: chips on array and grid cards; returns the names the chips consumed.
function bind(facts: RFacts, cards: Map<string, Structure>, vals: Map<string, RVal>): Set<string> {
  const used = new Set<string>();
  const add = (s: ArrayS | GridS, p: Ptr) => {
    if (!s.ptrs.some((q) => q.name === p.name)) s.ptrs.push(p);
  };
  for (const [c, n] of facts.cursors) {
    const s = cards.get(c);
    const i = intOf(vals.get(n));
    if (s?.kind !== 'array' || i === null) continue;
    add(s, { name: n, at: i });
    used.add(n);
  }
  for (const [g, r, c] of facts.grids) {
    const s = cards.get(g);
    const ri = intOf(vals.get(r));
    const ci = intOf(vals.get(c));
    if (s?.kind !== 'grid' || ri === null || ci === null) continue;
    add(s, { name: `${r},${c}`, at: [ri, ci] });
    used.add(r);
    used.add(c);
  }
  return used;
}

function children(o: RObj): RVal[] {
  if (o[0] === 'DICT') return (o.slice(1) as [RVal, RVal][]).flat();
  if (o[0] === 'OBJ') return (o as Obj)[2].map(([, v]) => v);
  return rest(o);
}

// Breadth first through every reference; nodes past a pool's budget are left out, and so are their children.
function walk(roots: RVal[], heap: Heap): { list: number[]; tree: number[]; cut: boolean } {
  const list: number[] = [];
  const tree: number[] = [];
  let cut = false;
  const seen = new Set<number>();
  const queue: number[] = [];
  const visit = (v: RVal) => {
    if (isRef(v) && !seen.has(v[1])) {
      seen.add(v[1]);
      queue.push(v[1]);
    }
  };
  roots.forEach(visit);
  for (let i = 0; i < queue.length; i++) {
    const o = heap.get(queue[i]);
    if (!o) continue;
    if (o[0] === 'LNODE' || o[0] === 'TNODE') {
      const [into, max]: [number[], number] = o[0] === 'LNODE' ? [list, MAX_LIST_NODES] : [tree, MAX_TREE_NODES];
      if (into.length >= max) {
        cut = true;
        continue;
      }
      into.push(queue[i]);
    }
    children(o).forEach(visit);
  }
  return { list: list.sort((a, b) => a - b), tree: tree.sort((a, b) => a - b), cut };
}

const link = (v: RVal, pool: Set<number>): NodeId | null => (isRef(v) && pool.has(v[1]) ? `n${v[1]}` : null);

function listPool(ids: number[], heap: Heap, name: string, ptrs: Ptr[]): ListS {
  const pool = new Set(ids);
  const nodes: Record<NodeId, ListNode> = {};
  for (const id of ids) {
    const [, val, next] = heap.get(id) as ['LNODE', RVal, RVal];
    nodes[`n${id}`] = { val: itemText(val, heap), next: link(next, pool) };
  }
  return { id: 't:#list', name, kind: 'list', nodes, ptrs };
}

function treePool(ids: number[], heap: Heap, name: string, ptrs: Ptr[]): TreeS {
  const pool = new Set(ids);
  const nodes: Record<NodeId, TreeNode> = {};
  for (const id of ids) {
    const [, val, left, right] = heap.get(id) as ['TNODE', RVal, RVal, RVal];
    nodes[`n${id}`] = { val: itemText(val, heap), left: link(left, pool), right: link(right, pool) };
  }
  return { id: 't:#tree', name, kind: 'tree', nodes, ptrs };
}

// The innermost MAX_ITEMS frames, outermost of those first: CallsView draws at most MAX_ITEMS from the top.
function callsCard(stack: SFrame[], heap: Heap): CallsS {
  return {
    id: 't:#calls',
    name: 'calls',
    kind: 'calls',
    frames: stack.slice(-MAX_ITEMS).map((f) => ({
      fn: shortName(f.fn),
      locals: ordered(f)
        .filter(([n]) => n !== 'self')
        .map(([n, v]): [string, Val] => [n, textOf(v, heap)]),
    })),
  };
}

// A generator expression's frame has no facts of its own; it uses its enclosing function's.
const GENEXPR = '.<locals>.<genexpr>';
const factsOf = (raw: RTrace, fn: string): RFacts | undefined =>
  raw.facts[fn] ?? (fn.endsWith(GENEXPR) ? raw.facts[fn.slice(0, -GENEXPR.length)] : undefined);

export function mapStep(state: State, ctx: MapCtx): { board: Board; cut: boolean } {
  const { raw, info, k, last } = ctx;
  const heap = state.heap;
  const top = state.stack[state.stack.length - 1];
  const facts = (top && factsOf(raw, top.fn)) ?? NO_FACTS;
  const strs = new Set(facts.strs);
  const vars = top ? named(top, heap) : [];
  const cards = new Map<string, Structure>();
  const ptrs: Record<NodeKind, Ptr[]> = { list: [], tree: [] };
  for (const [name, v] of vars) {
    const p = ptrOf(name, v, heap, info);
    if (p) ptrs[p.kind].push({ name, at: p.at });
    else cards.set(name, card(`t:${name}`, name, v, heap, strs.has(name)));
  }
  for (const name of bind(facts, cards, new Map(vars))) cards.delete(name);
  const out = [...cards.values()];

  const value = last && raw.end.kind === 'return' ? raw.end.value : undefined;
  let ret: Structure | undefined;
  if (value !== undefined) {
    const kind = nodeKind(value, heap);
    if (kind) ptrs[kind].push({ name: 'return', at: `n${(value as ['R', number])[1]}` });
    else ret = card('t:#return', 'return', value, heap, false);
  }
  let cut = false;
  if (info.hasList || info.hasTree) {
    const roots = [...state.stack.flatMap((f) => [...f.locals.values()]), ...raw.entry.args, ...(value === undefined ? [] : [value])];
    const w = walk(roots, heap);
    cut = w.cut;
    if (info.hasList) out.push(listPool(w.list, heap, raw.entry.lists.join(', ') || 'ListNode', ptrs.list));
    if (info.hasTree) out.push(treePool(w.tree, heap, raw.entry.trees.join(', ') || 'TreeNode', ptrs.tree));
  }
  if (info.deep) out.push(callsCard(state.stack, heap));
  if (ret) out.push(ret);
  if (raw.outputs) {
    const items = raw.outputs.filter((o) => o.at <= k).map((o) => o.v);
    out.push({ id: 't:#output', name: 'output', kind: 'array', items, ptrs: [] });
  }
  return { board: { structs: Object.fromEntries(out.map((s) => [s.id, s])) }, cut };
}

export function mapBoard(state: State, ctx: MapCtx): Board {
  return mapStep(state, ctx).board;
}
