import type { RObj, RVal } from './raw';

export const TEXT_LIMIT = 100;

type Heap = Map<number, RObj>;
type Obj = Extract<RObj, ['OBJ', ...unknown[]]>;

const rest = (o: RObj): RVal[] => o.slice(1) as RVal[];
const pairs = (o: RObj): [RVal, RVal][] => o.slice(1) as [RVal, RVal][];
const cut = (t: string, limit: number) => (t.length > limit ? `${t.slice(0, limit - 1)}…` : t);

export function shortName(fn: string): string {
  return fn.slice(fn.lastIndexOf('.') + 1);
}

function node(o: RObj): string {
  const val = o[1];
  return `${o[0] === 'LNODE' ? 'ListNode' : 'TreeNode'}(${typeof val === 'string' ? val : '…'})`;
}

// An item one level down: strings as written, nodes in full, everything else abbreviated unless empty.
function brief(v: RVal, heap: Heap): string {
  if (typeof v === 'string') return v;
  const o = heap.get(v[1]);
  if (!o) return '…';
  const empty = o.length === 1;
  switch (o[0]) {
    case 'LIST':
      return empty ? '[]' : '[…]';
    case 'TUPLE':
      return empty ? '()' : '(…)';
    case 'DICT':
      return empty ? '{}' : '{…}';
    case 'SET':
      return empty ? 'set()' : '{…}';
    case 'DEQUE':
      return empty ? 'deque([])' : 'deque([…])';
    case 'LNODE':
    case 'TNODE':
      return node(o);
    default: {
      const [, cls, fields, text] = o as Obj;
      return text ?? (fields.length ? `${cls}(…)` : `${cls}()`);
    }
  }
}

function full(v: RVal, heap: Heap): string {
  if (typeof v === 'string') return v;
  const o = heap.get(v[1]);
  if (!o) return '…';
  const items = () => rest(o).map((x) => brief(x, heap)).join(', ');
  switch (o[0]) {
    case 'LIST':
      return `[${items()}]`;
    case 'TUPLE':
      return o.length === 2 ? `(${items()},)` : `(${items()})`;
    case 'SET':
      return o.length === 1 ? 'set()' : `{${items()}}`;
    case 'DEQUE':
      return `deque([${items()}])`;
    case 'DICT':
      return `{${pairs(o).map(([k, x]) => `${brief(k, heap)}: ${brief(x, heap)}`).join(', ')}}`;
    case 'LNODE':
    case 'TNODE':
      return node(o);
    default: {
      const [, cls, fields, text] = o as Obj;
      if (text !== undefined) return text;
      const shown = fields.slice(0, 4).map(([f, x]) => `${f}=${brief(x, heap)}`);
      if (fields.length > 4) shown.push('…');
      return `${cls}(${shown.join(', ')})`;
    }
  }
}

export function textOf(v: RVal, heap: Heap, limit = TEXT_LIMIT): string {
  return cut(full(v, heap), limit);
}
