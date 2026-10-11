import type { Board, Id, Structure } from '../model/types';
import type { Step } from './types';

function size(s: Structure): number {
  switch (s.kind) {
    case 'array':
    case 'set':
    case 'stack':
    case 'queue':
      return s.items.length;
    case 'grid':
      return s.rows.reduce((n, r) => n + r.length, 0);
    case 'list':
    case 'tree':
      return Object.keys(s.nodes).length;
    case 'map':
      return s.entries.length;
    case 'calls':
      return s.frames.length;
    case 'var':
      return 0;
  }
}

function longest(s: Structure): number {
  let m = 0;
  const see = (t: string) => {
    if (t.length > m) m = t.length;
  };
  switch (s.kind) {
    case 'array':
    case 'set':
    case 'stack':
    case 'queue':
      s.items.forEach(see);
      break;
    case 'grid':
      for (const r of s.rows) r.forEach(see);
      break;
    case 'list':
    case 'tree':
      for (const n of Object.values(s.nodes)) see(n.val);
      break;
    case 'map':
      for (const e of s.entries) e.forEach(see);
      break;
    case 'calls':
      for (const f of s.frames) {
        see(f.fn);
        for (const l of f.locals) l.forEach(see);
      }
      break;
    case 'var':
      see(s.value);
      break;
  }
  return m;
}

type Best = { s: Structure; size: number; longest: number };

// Spec §5.7: each card's largest version across the trace, in order of first appearance, for Plan 4's reservation.
export function largest(steps: Step[]): Board {
  const best = new Map<Id, Best>();
  for (const { board } of steps) {
    for (const s of Object.values(board.structs)) {
      const b = best.get(s.id);
      if (b?.s === s) continue;
      const n = size(s);
      if (!b || n > b.size) best.set(s.id, { s, size: n, longest: longest(s) });
      else if (n === b.size) {
        const l = longest(s);
        if (l > b.longest) best.set(s.id, { s, size: n, longest: l });
      }
    }
  }
  return { structs: Object.fromEntries([...best].map(([id, b]) => [id, b.s])) };
}
