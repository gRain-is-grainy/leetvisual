import type { RObj, RTrace, RVal } from './raw';

export type TraceInfo = { ptrVars: Map<string, 'list' | 'tree'>; hasList: boolean; hasTree: boolean; deep: boolean };

type Obj = Extract<RObj, ['OBJ', ...unknown[]]>;

// Pass 1 over the raw steps: what every step's board must know about the whole trace (spec §5.3).
export function scan(raw: RTrace): TraceInfo {
  // An object's tag never changes, so one map of every entry ever sent tells what a reference points to.
  const tags = new Map<number, RObj[0]>();
  for (const s of raw.steps) {
    for (const objs of [s.heap, s.dh]) if (objs) for (const [id, o] of Object.entries(objs)) tags.set(Number(id), o[0]);
  }
  const all = [...tags.values()];
  const info: TraceInfo = {
    ptrVars: new Map(),
    hasList: all.includes('LNODE'),
    hasTree: all.includes('TNODE'),
    deep: raw.steps.some((s) => s.depth >= 2),
  };
  const note = (name: string, v: RVal) => {
    const tag = typeof v === 'string' ? undefined : tags.get(v[1]);
    const kind = tag === 'LNODE' ? 'list' : tag === 'TNODE' ? 'tree' : undefined;
    if (kind && !info.ptrVars.has(name)) info.ptrVars.set(name, kind);
  };
  const selves = new Set<number>();
  for (const s of raw.steps) {
    const bound = [...(s.stack ?? []).map((f) => f.locals), ...(s.push ? [s.push.locals] : []), ...(s.fd ?? []).map((d) => d.set ?? {})];
    for (const locals of bound) {
      for (const [name, v] of Object.entries(locals)) {
        if (name === 'self' && typeof v !== 'string') selves.add(v[1]);
        note(name, v);
      }
    }
    for (const objs of [s.heap, s.dh]) {
      if (!objs) continue;
      for (const [id, o] of Object.entries(objs)) {
        if (o[0] === 'OBJ' && selves.has(Number(id))) for (const [field, v] of (o as Obj)[2]) note(`self.${field}`, v);
      }
    }
  }
  return info;
}
