import type { RFrame, RObj, RStep, RVal } from './raw';

export type SFrame = { fid: number; fn: string; names: string[]; locals: Map<string, RVal> };
export type State = { stack: SFrame[]; heap: Map<number, RObj> };

const toFrame = (f: RFrame): SFrame => ({ fid: f.fid, fn: f.fn, names: f.names, locals: new Map(Object.entries(f.locals)) });

function addHeap(heap: Map<number, RObj>, objs: Record<string, RObj> | undefined): void {
  if (objs) for (const [id, o] of Object.entries(objs)) heap.set(Number(id), o);
}

// One State, changed in place and yielded after each step's changes. A return step is shown with its frame still on
// the stack; the frame is removed before the next step's changes. A keyframe replaces the stack and heap outright.
export function* replay(steps: RStep[]): Generator<State> {
  const state: State = { stack: [], heap: new Map() };
  let pop = false;
  for (const s of steps) {
    if (pop) state.stack.pop();
    pop = s.pop === 1;
    if (s.k) {
      state.stack.length = 0;
      for (const f of s.stack ?? []) state.stack.push(toFrame(f));
      state.heap.clear();
      addHeap(state.heap, s.heap);
    } else {
      if (s.push) state.stack.push(toFrame(s.push));
      addHeap(state.heap, s.dh);
      for (const d of s.fd ?? []) {
        const f = state.stack.find((x) => x.fid === d.fid);
        if (!f) continue;
        for (const [name, v] of Object.entries(d.set ?? {})) f.locals.set(name, v);
        for (const name of d.del ?? []) f.locals.delete(name);
      }
    }
    yield state;
  }
}
