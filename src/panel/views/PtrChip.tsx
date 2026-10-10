import { startDrag } from '../drag/drag';
import { selKey } from '../model/loc';
import type { Id, Ptr } from '../model/types';
import { act } from '../state';
import { editing, refocus, startEdit } from '../ui';
import { Edit } from './Edit';

type PtrChipProps = { s: Id; ptr: Ptr; ro: boolean; changed?: boolean };

export function PtrChip({ s, ptr, ro, changed }: PtrChipProps) {
  const sel = { t: 'ptr', s, name: ptr.name } as const;
  const key = selKey(sel);
  const cls = ['lv-ptr', ptr.at === null ? 'lv-ptr-null' : '', changed ? 'lv-changed' : ''].filter(Boolean).join(' ');
  if (editing.value === key) {
    return (
      <span class={cls}>
        <Edit
          value={ptr.name}
          label="Rename pointer"
          onCommit={(v) => {
            if (editing.value !== key) return; // removed by a canvas switch; Chrome still fires blur
            editing.value = null;
            const ok = act({ t: 'renamePtr', s, name: ptr.name, to: v });
            refocus(ok ? { ...sel, name: v } : sel);
          }}
          onCancel={() => {
            editing.value = null;
            refocus(sel);
          }}
        />
      </span>
    );
  }
  return (
    <span
      class={cls}
      tabIndex={0}
      data-sel={key}
      title={`Pointer ${ptr.name}`}
      onPointerDown={ro ? undefined : (e) => startDrag(e, sel)}
      onDblClick={() => startEdit(sel)}
    >
      {ptr.name}
    </span>
  );
}
