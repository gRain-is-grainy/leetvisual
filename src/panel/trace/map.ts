import type { Board, Id, Structure, Val } from '../model/types';
import { isStr, splitChars } from '../parse/tokens';
import type { RFacts, RObj, RTrace, RVal } from './raw';
import type { SFrame, State } from './replay';
import type { TraceInfo } from './scan';
import { textOf } from './text';

export type MapCtx = { raw: RTrace; info: TraceInfo; k: number; last: boolean };

type Heap = Map<number, RObj>;
type Obj = Extract<RObj, ['OBJ', ...unknown[]]>;

const NO_FACTS: RFacts = { cursors: [], grids: [], strs: [] };

const isRef = (v: RVal | undefined): v is ['R', number] => Array.isArray(v);
const rest = (o: RObj): RVal[] => o.slice(1) as RVal[];
const itemText = (v: RVal, heap: Heap): Val => (typeof v === 'string' ? v : textOf(v, heap));

// A frame's locals in its code object's order; names the frame does not list go last, in the order they were bound.
function ordered(f: SFrame): [string, RVal][] {
  const rank = (n: string) => {
    const i = f.names.indexOf(n);
    return i < 0 ? f.names.length : i;
  };
  return [...f.locals].sort((a, b) => rank(a[0]) - rank(b[0]));
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

// A generator expression's frame has no facts of its own; it uses its enclosing function's.
const GENEXPR = '.<locals>.<genexpr>';
const factsOf = (raw: RTrace, fn: string): RFacts | undefined =>
  raw.facts[fn] ?? (fn.endsWith(GENEXPR) ? raw.facts[fn.slice(0, -GENEXPR.length)] : undefined);

export function mapStep(state: State, ctx: MapCtx): { board: Board; cut: boolean } {
  const heap = state.heap;
  const top = state.stack[state.stack.length - 1];
  const facts = (top && factsOf(ctx.raw, top.fn)) ?? NO_FACTS;
  const strs = new Set(facts.strs);
  const out = (top ? named(top, heap) : []).map(([name, v]) => card(`t:${name}`, name, v, heap, strs.has(name)));
  return { board: { structs: Object.fromEntries(out.map((s) => [s.id, s])) }, cut: false };
}

export function mapBoard(state: State, ctx: MapCtx): Board {
  return mapStep(state, ctx).board;
}
