import type { CSSProperties, JSX } from 'preact';
import { startDrag } from '../drag/drag';
import { locKey, selKey, type Loc } from '../model/loc';
import type { Val } from '../model/types';
import { act } from '../state';
import { editing, refocus, startEdit } from '../ui';
import { Edit } from './Edit';

export type SlotProps = {
  at: Loc;
  val: Val;
  text: string;
  ro: boolean;
  changed?: boolean;
  drop?: boolean;
  drag?: boolean;
  class?: string;
  style?: CSSProperties;
  title?: string;
  onClick?: (e: MouseEvent) => void;
  onDblClick?: (e: MouseEvent) => void;
};

export function Slot(p: SlotProps): JSX.Element {
  const sel = { t: 'val', at: p.at } as const;
  const key = selKey(sel);
  const cls = ['lv-slot', p.class, p.changed ? 'lv-changed' : ''].filter(Boolean).join(' ');
  if (editing.value === key) {
    return (
      <div class={cls} style={p.style}>
        <Edit
          value={p.val}
          label="Edit value"
          onCommit={(v) => {
            if (editing.value !== key) return; // removed by a canvas switch; Chrome still fires blur
            editing.value = null;
            act({ t: 'set', at: p.at, val: v });
            refocus(sel);
          }}
          onCancel={() => {
            editing.value = null;
            refocus(sel);
          }}
        />
      </div>
    );
  }
  return (
    <div
      class={cls}
      style={p.style}
      title={p.title ?? p.val}
      tabIndex={0}
      data-sel={key}
      data-drop={p.drop && !p.ro ? locKey(p.at) : undefined}
      onPointerDown={p.ro || p.drag === false ? undefined : (e) => startDrag(e, sel)}
      onClick={p.onClick}
      onDblClick={p.onDblClick ?? (() => startEdit(sel))}
    >
      {p.text}
    </div>
  );
}
