import { useMemo } from 'preact/hooks';
import { layoutList } from '../layout/list';
import { byId } from '../model/ids';
import { locKey } from '../model/loc';
import { newNodeId } from '../model/ops';
import type { ListS, NodeId } from '../model/types';
import { act } from '../state';
import { startEdit } from '../ui';
import { Ctrl } from './Ctrl';
import { changedNodes, changedPtrs } from './diff';
import { Handle } from './Handle';
import type { ViewProps } from './index';
import { MAX_ITEMS } from './limits';
import { addPtr, AsidePtrs, groupPtrs, PtrGroup } from './Ptrs';
import { Slot } from './Slot';

const NODE_W = 44;
const HANDLE_W = 12;
const NODE_H = 32;
const COL = 88;
const ROW = 64;
const PTR_H = 18;
const DIP = 28;
const NONE = new Set<string>();

type XY = { x: number; y: number };
type Shape = 'next' | 'back' | 'merge';
const ARROW_CLASS: Record<Shape, string> = {
  next: 'lv-arrow',
  back: 'lv-arrow lv-arrow-back',
  merge: 'lv-arrow lv-arrow-merge',
};

export function ListView({ s, prev, ro }: ViewProps<ListS>) {
  const layout = useMemo(() => layoutList(s), [s]);
  const visible = layout.rows.flat().slice(0, MAX_ITEMS);
  const onBoard = new Set(visible);
  const changed = prev && prev !== s ? changedNodes(prev, s) : NONE;
  const ptrChanged = prev && prev !== s ? changedPtrs(prev.ptrs, s.ptrs) : NONE;
  const aside = s.ptrs.filter((p) => typeof p.at !== 'string' || !onBoard.has(p.at));
  const ptrsAt = groupPtrs(s.ptrs.filter((p) => !aside.includes(p)));
  const at = (n: NodeId): XY => ({ x: layout.pos[n].x * COL, y: layout.pos[n].y * ROW + PTR_H });
  let cols = 0;
  let rows = 0;
  for (const n of visible) {
    cols = Math.max(cols, layout.pos[n].x + 1);
    rows = Math.max(rows, layout.pos[n].y + 1);
  }
  const w = (cols - 1) * COL + NODE_W + HANDLE_W;
  const h = rows * ROW + DIP;
  const marker = `lv-ah-${s.id}`;

  function addNode() {
    const n = newNodeId(s);
    if (act({ t: 'node', s: s.id, val: '' })) startEdit({ t: 'val', at: { s: s.id, k: 'node', n } });
  }

  return (
    <div class="lv-list-view">
      {visible.length === 0 ? (
        <span class="lv-empty">empty</span>
      ) : (
        <div class="lv-list" style={{ width: `${w}px`, height: `${h}px` }}>
          <svg class="lv-links" width={w} height={h} aria-hidden="true">
            <defs>
              <marker id={marker} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                <path class="lv-arrow-head" d="M0 0L8 4L0 8z" />
              </marker>
            </defs>
            {visible.map((n) => {
              const to = s.nodes[n].next;
              if (!to || !onBoard.has(to)) return null;
              const a = layout.pos[n];
              const b = layout.pos[to];
              // A row stops only at null or at a placed node, so a link that is not to the next node in the row
              // goes back within the row (a cycle) or up into an earlier row (two chains joining).
              const shape: Shape = b.y < a.y ? 'merge' : b.y === a.y && b.x === a.x + 1 ? 'next' : 'back';
              return (
                <path key={n} class={ARROW_CLASS[shape]} d={arrow(at(n), at(to), shape)} marker-end={`url(#${marker})`} />
              );
            })}
          </svg>
          {visible.map((n) => {
            const { x, y } = at(n);
            const node = s.nodes[n];
            const here = ptrsAt.get(n);
            const loc = { s: s.id, k: 'node', n } as const;
            // The wrapper is the drop target, so a drop on this node's handle or pointer chips lands on the node.
            return (
              <div
                class="lv-list-node"
                key={n}
                style={{ left: `${x}px`, top: `${y}px` }}
                data-drop={ro ? undefined : locKey(loc)}
              >
                {here && <PtrGroup class="lv-node-ptrs" s={s.id} ptrs={here} ro={ro} changed={ptrChanged} />}
                <Slot at={loc} val={node.val} text={node.val} ro={ro} changed={changed.has(n)} />
                <Handle s={s.id} n={n} side="next" ro={ro} set={node.next !== null} />
              </div>
            );
          })}
        </div>
      )}
      <div class="lv-ctrls">
        <Ctrl label="+ node" title="Add node" onClick={addNode} disabled={ro} />
        <Ctrl label="+ptr" title="Add pointer" onClick={() => addPtr(s, Object.keys(s.nodes).sort(byId)[0] ?? null)} disabled={ro} />
        <AsidePtrs s={s.id} ptrs={aside} ro={ro} changed={ptrChanged} />
      </div>
    </div>
  );
}

function arrow(a: XY, b: XY, shape: Shape): string {
  if (shape === 'next') {
    const y = a.y + NODE_H / 2;
    return `M${a.x + NODE_W + HANDLE_W} ${y}L${b.x - 2} ${y}`;
  }
  // Both curves end under the target. A back arrow leaves the handle's bottom and dips under its row;
  // a merge arrow leaves the handle's top and rises to the earlier row, so it never crosses its own row.
  const sx = a.x + NODE_W + HANDLE_W / 2;
  const sy = shape === 'back' ? a.y + NODE_H : a.y;
  const c1 = shape === 'back' ? sy + DIP : sy - DIP;
  const ex = b.x + NODE_W / 2;
  const ey = b.y + NODE_H + 2;
  return `M${sx} ${sy}C${sx} ${c1} ${ex} ${ey + DIP} ${ex} ${ey}`;
}
