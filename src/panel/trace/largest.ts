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

function texts(s: Structure): string[] {
  switch (s.kind) {
    case 'array':
    case 'set':
    case 'stack':
    case 'queue':
      return s.items;
    case 'grid':
      return s.rows.flat();
    case 'list':
    case 'tree':
      return Object.values(s.nodes).map((n) => n.val);
    case 'map':
      return s.entries.flat();
    case 'calls':
      return s.frames.flatMap((f) => [f.fn, ...f.locals.flat()]);
    case 'var':
      return [s.value];
  }
}

const longest = (s: Structure) => texts(s).reduce((m, t) => Math.max(m, t.length), 0);

function bigger(a: Structure, b: Structure): boolean {
  const d = size(a) - size(b);
  return d > 0 || (d === 0 && longest(a) > longest(b));
}

// Spec §5.7: each card's largest version across the trace, in order of first appearance, for Plan 4's reservation.
export function largest(steps: Step[]): Board {
  const best = new Map<Id, Structure>();
  for (const { board } of steps) {
    for (const s of Object.values(board.structs)) {
      const b = best.get(s.id);
      if (!b || (b !== s && bigger(s, b))) best.set(s.id, s);
    }
  }
  return { structs: Object.fromEntries(best) };
}
