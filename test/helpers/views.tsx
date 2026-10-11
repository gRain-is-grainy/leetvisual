import { selKey, type Sel } from '../../src/panel/model/loc';
import type { Id } from '../../src/panel/model/types';
import { prevShown, readOnly, shown } from '../../src/panel/state';
import { View } from '../../src/panel/views/index';

export function bySel(root: ParentNode, sel: Sel): HTMLElement {
  const key = selKey(sel);
  const el = [...root.querySelectorAll<HTMLElement>('[data-sel]')].find((e) => e.dataset.sel === key);
  if (!el) throw new Error(`no element for ${key}`);
  return el;
}

export function Live({ id }: { id: Id }) {
  const s = shown.value?.structs[id];
  const p = prevShown.value?.structs[id];
  return s ? <View s={s} prev={p && p.kind === s.kind ? p : undefined} ro={readOnly.value} /> : null;
}
