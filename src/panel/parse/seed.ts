import type { Meta, Param } from '../../shared/messages';
import { addChain, addTree } from '../model/build';
import type { Board, ListS, Structure, TreeS } from '../model/types';
import { isStr, parseLiteral, splitChars, type Lit } from './tokens';

const SCALAR = /^(integer|long|double|boolean|character|string)$/i;
const DESIGN: Param[] = [
  { name: 'methods', type: 'string[]' },
  { name: 'args', type: 'list<list<string>>' },
];

// 'integer[][]' and 'list<list<integer>>' → { elem: 'integer', depth: 2 }
function shape(type: string): { elem: string; depth: number } {
  let elem = type.trim();
  let depth = 0;
  for (;;) {
    const inner = /^list<(.*)>$/i.exec(elem);
    if (elem.endsWith('[]')) elem = elem.slice(0, -2);
    else if (inner) elem = inner[1].trim();
    else return { elem, depth };
    depth++;
  }
}

const isRow = (x: Lit): x is string[] => Array.isArray(x) && x.every((y) => typeof y === 'string');
const isRows = (x: Lit): x is string[][] => Array.isArray(x) && x.every(isRow);

function infer(lit: Lit): string {
  if (!Array.isArray(lit)) return isStr(lit) ? 'string' : 'integer';
  return lit.length > 0 && isRows(lit) ? 'string[][]' : 'string[]';
}

export function seedBoard(meta: Meta | null, inputs: string[]): Board {
  const params = meta?.classname ? DESIGN : (meta?.params ?? []);
  const out: Structure[] = [];
  let lists: ListS | null = null;
  let trees: TreeS | null = null;
  const id = () => 's' + (out.length + 1);
  const listPool = (name: string): ListS => {
    if (!lists) out.push((lists = { id: id(), name, kind: 'list', nodes: {}, ptrs: [] }));
    else lists.name += `, ${name}`;
    return lists;
  };
  const treePool = (name: string): TreeS => {
    if (!trees) out.push((trees = { id: id(), name, kind: 'tree', nodes: {}, ptrs: [] }));
    else trees.name += `, ${name}`;
    return trees;
  };

  inputs.forEach((input, i) => {
    const name = params[i]?.name ?? `arg${i + 1}`;
    const text = input.replace(/\r/g, '').trim();
    const raw = () => out.push({ id: id(), name, kind: 'var', value: text });
    let lit: Lit;
    try {
      lit = parseLiteral(text);
    } catch {
      raw();
      return;
    }
    const { elem, depth } = shape(params[i]?.type ?? infer(lit));
    const scalar = SCALAR.test(elem);
    if (scalar && depth === 0 && /^string$/i.test(elem)) {
      if (typeof lit === 'string' && isStr(lit)) {
        out.push({ id: id(), name, kind: 'array', items: splitChars(lit), ptrs: [], chars: true });
      } else raw();
    } else if (scalar && depth === 0 && typeof lit === 'string') {
      out.push({ id: id(), name, kind: 'var', value: lit });
    } else if (scalar && depth === 1 && isRow(lit)) {
      out.push({ id: id(), name, kind: 'array', items: lit, ptrs: [] });
    } else if (scalar && depth === 2 && isRows(lit)) {
      out.push({ id: id(), name, kind: 'grid', rows: lit, marked: [], ptrs: [] });
    } else if (elem === 'ListNode' && depth === 0 && isRow(lit)) {
      const pool = listPool(name);
      pool.ptrs.push({ name, at: addChain(pool.nodes, lit) });
    } else if (elem === 'ListNode' && depth === 1 && isRows(lit)) {
      const pool = listPool(name);
      lit.forEach((vals, j) => pool.ptrs.push({ name: `${name}[${j}]`, at: addChain(pool.nodes, vals) }));
    } else if (elem === 'TreeNode' && depth === 0 && isRow(lit)) {
      const pool = treePool(name);
      pool.ptrs.push({ name, at: addTree(pool.nodes, lit) });
    } else raw();
  });

  return { structs: Object.fromEntries(out.map((s) => [s.id, s])) };
}
