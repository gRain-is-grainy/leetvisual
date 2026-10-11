import { initHist, newCanvas } from '../../src/panel/model/history';
import type { ArrayS, Board, Id, Pos, Structure, VarS } from '../../src/panel/model/types';
import { pendingLine, session, viewing } from '../../src/panel/state';
import { drag, editing } from '../../src/panel/ui';

export const arr = (id: Id, name: string, items: string[], extra: Partial<ArrayS> = {}): ArrayS => ({
  id,
  name,
  kind: 'array',
  items,
  ptrs: [],
  ...extra,
});

export const vr = (id: Id, name: string, value: string): VarS => ({ id, name, kind: 'var', value });

export const board = (...structs: Structure[]): Board => ({
  structs: Object.fromEntries(structs.map((s) => [s.id, s])),
});

export function startSession(b: Board, layout: Record<Id, Pos> = {}): void {
  editing.value = null;
  drag.value = null;
  viewing.value = null;
  pendingLine.value = undefined;
  session.value = { key: 'leetcode.com:two-sum:test', slug: 'two-sum', hist: initHist({ ...newCanvas(b), layout }) };
}

export const draft = (): Board => session.value!.hist.canvas.draft;
export const layoutOf = (): Record<Id, Pos> => session.value!.hist.canvas.layout;

// happy-dom has no layout engine. stubLayout gives cards and the board fixed sizes (tests may change
// fakeSize), makes pointer capture a no-op, and installs a ResizeObserver that fires on fireResize().
export const fakeSize = { board: { w: 800, h: 600 }, card: { w: 100, h: 60 } };
const resizeCallbacks = new Set<() => void>();

export function fireResize(): void {
  for (const cb of resizeCallbacks) cb();
}

export function stubLayout(w = 100, h = 60): void {
  fakeSize.card = { w, h };
  const size = (el: HTMLElement, k: 'w' | 'h') =>
    el.dataset.card ? fakeSize.card[k] : el.dataset.testid === 'board' ? fakeSize.board[k] : 0;
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get() {
      return size(this as HTMLElement, 'w');
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      return size(this as HTMLElement, 'h');
    },
  });
  HTMLElement.prototype.setPointerCapture = () => {};
  globalThis.ResizeObserver = class {
    cb: () => void;
    constructor(cb: () => void) {
      this.cb = cb;
    }
    observe() {
      resizeCallbacks.add(this.cb);
    }
    unobserve() {}
    disconnect() {
      resizeCallbacks.delete(this.cb);
    }
  } as unknown as typeof ResizeObserver;
}
