import { startDrag } from '../drag/drag';
import { selKey, type Side } from '../model/loc';
import type { Id, NodeId } from '../model/types';

type HandleProps = { s: Id; n: NodeId; side: Side; ro: boolean; set: boolean };

export function Handle({ s, n, side, ro, set }: HandleProps) {
  return (
    <span
      class={set ? `lv-handle lv-handle-${side} lv-handle-set` : `lv-handle lv-handle-${side}`}
      tabIndex={0}
      aria-label={`${side} of node ${n}`}
      title={`Drag to set ${side}`}
      data-sel={selKey({ t: 'link', s, n, side })}
      onPointerDown={(e) => {
        if (ro) return;
        e.stopPropagation();
        startDrag(e, { t: 'link', s, n, side });
      }}
    />
  );
}
