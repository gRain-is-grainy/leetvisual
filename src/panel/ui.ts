import { computed, effect, signal, untracked } from '@preact/signals';
import { canEdit } from './model/drop';
import { selKey, type Loc, type Sel, type Src } from './model/loc';
import { readOnly, session, shown } from './state';

export type DragState = {
  src: Src;
  label: string;
  mode: 'pointer' | 'keyboard';
  x: number;
  y: number;
  targets: (Loc | null)[];
  ti: number;
};

export const editing = signal<string | null>(null);
export const drag = signal<DragState | null>(null);

// A new canvas reuses ids s1, s2, ..., so an editor or drag left open would land on the wrong board.
const sessionKey = computed(() => session.value?.key);
effect(() => {
  void sessionKey.value;
  untracked(() => {
    editing.value = null;
    drag.value = null;
  });
});

export function startEdit(sel: Sel): void {
  const b = shown.value;
  if (!b || readOnly.value || !canEdit(b, sel)) return;
  editing.value = selKey(sel);
}

export function focusSel(sel: Sel): boolean {
  const key = selKey(sel);
  for (const el of document.querySelectorAll<HTMLElement>('[data-sel]')) {
    if (el.dataset.sel === key) {
      el.focus();
      return true;
    }
  }
  return false;
}

// After the current event, if the action dropped focus to <body>, focus `sel`'s element, else that selection's
// card header, else the board (null means the board). If the user moved focus somewhere (clicked the line field,
// tabbed on), leave it there.
export function refocus(sel: Sel | null): void {
  setTimeout(() => {
    const a = document.activeElement;
    if (a && a !== document.body) return;
    if (sel && focusSel(sel)) return;
    if (sel && sel.t !== 'card' && focusSel({ t: 'card', s: sel.t === 'val' ? sel.at.s : sel.s })) return;
    document.querySelector<HTMLElement>('[data-testid="board"]')?.focus();
  }, 0);
}
