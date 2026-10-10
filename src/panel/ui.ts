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

export function focusSel(sel: Sel): void {
  const key = selKey(sel);
  for (const el of document.querySelectorAll<HTMLElement>('[data-sel]')) {
    if (el.dataset.sel === key) {
      el.focus();
      return;
    }
  }
}

// After the current event, put focus back on `sel` (or on the board, for null) if the action dropped it
// to <body>. If the user moved focus somewhere (clicked the line field, tabbed on), leave it there.
export function refocus(sel: Sel | null): void {
  setTimeout(() => {
    const a = document.activeElement;
    if (a && a !== document.body) return;
    if (sel) focusSel(sel);
    else document.querySelector<HTMLElement>('[data-testid="board"]')?.focus();
  }, 0);
}
