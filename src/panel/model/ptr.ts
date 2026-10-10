import { byId } from './ids';
import type { NodeId, PtrAt, PtrS } from './types';

export type Dir = 'left' | 'right' | 'up' | 'down';

export function stepPtr(s: PtrS, name: string, dir: Dir): PtrAt | undefined {
  const at = s.ptrs.find((p) => p.name === name)?.at;
  if (at === undefined || at === null) return undefined;
  switch (s.kind) {
    case 'array': {
      const i = (at as number) + (dir === 'left' ? -1 : dir === 'right' ? 1 : 0);
      return i !== at && i >= 0 && i < s.items.length ? i : undefined;
    }
    case 'grid': {
      const [r, c] = at as [number, number];
      const nr = r + (dir === 'up' ? -1 : dir === 'down' ? 1 : 0);
      const row = s.rows[nr];
      if (!row || row.length === 0) return undefined;
      const nc = Math.min(c + (dir === 'left' ? -1 : dir === 'right' ? 1 : 0), row.length - 1);
      return nc < 0 || (nr === r && nc === c) ? undefined : [nr, nc];
    }
    case 'list': {
      const n = at as NodeId;
      if (dir === 'right') return s.nodes[n]?.next ?? undefined;
      if (dir !== 'left') return undefined;
      return Object.keys(s.nodes).filter((id) => s.nodes[id].next === n).sort(byId)[0];
    }
    case 'tree': {
      const node = s.nodes[at as NodeId];
      if (!node) return undefined;
      if (dir === 'left') return node.left ?? undefined;
      if (dir === 'right') return node.right ?? undefined;
      if (dir === 'down') return node.left ?? node.right ?? undefined;
      return Object.keys(s.nodes)
        .filter((id) => s.nodes[id].left === at || s.nodes[id].right === at)
        .sort(byId)[0];
    }
  }
}
