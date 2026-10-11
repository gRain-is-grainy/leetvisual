import type { JSX } from 'preact';
import { useMemo } from 'preact/hooks';
import { roots } from '../layout/roots';
import { layoutTree } from '../layout/tree';
import { byId } from '../model/ids';
import { locKey } from '../model/loc';
import { newNodeId } from '../model/ops';
import type { NodeId, TreeNode, TreeS } from '../model/types';
import { act } from '../state';
import { startEdit } from '../ui';
import { Ctrl } from './Ctrl';
import { changedNodes, changedPtrs } from './diff';
import { Handle } from './Handle';
import type { ViewProps } from './index';
import { MAX_NODES } from './limits';
import { addPtr, AsidePtrs, groupPtrs, PtrGroup } from './Ptrs';
import { Slot } from './Slot';

const NODE_W = 40;
const NODE_H = 32;
const HANDLE_H = 10;
const COL = 48;
const ROW = 72;
const PTR_H = 18;
const NONE = new Set<string>();

export function visibleTree(s: TreeS): TreeS {
  const ids = Object.keys(s.nodes);
  if (ids.length <= MAX_NODES) return s;
  const children = new Set<NodeId>();
  for (const n of Object.values(s.nodes)) {
    if (n.left) children.add(n.left);
    if (n.right) children.add(n.right);
  }
  // Same start order as layoutTree: the roots, then the lowest unvisited id for nodes that sit only on a cycle.
  const queue = roots(ids, children, s.ptrs);
  const rest = [...ids].sort(byId);
  const keep = new Set<NodeId>();
  // ids.length > MAX_NODES, so an unvisited id is always left while keep is below the limit.
  for (let i = 0, r = 0; keep.size < MAX_NODES; i++) {
    if (i === queue.length) {
      while (keep.has(rest[r])) r++;
      queue.push(rest[r]);
    }
    const id = queue[i];
    if (keep.has(id)) continue;
    keep.add(id);
    const n = s.nodes[id];
    if (n.left) queue.push(n.left);
    if (n.right) queue.push(n.right);
  }
  const nodes: Record<NodeId, TreeNode> = {};
  for (const id of keep) {
    const n = s.nodes[id];
    nodes[id] = {
      val: n.val,
      left: n.left && keep.has(n.left) ? n.left : null,
      right: n.right && keep.has(n.right) ? n.right : null,
    };
  }
  // Pointers stay: layoutTree's root order ignores ones to hidden nodes, and the view lists those aside.
  return { ...s, nodes };
}

export function TreeView({ s, prev, ro }: ViewProps<TreeS>) {
  const v = useMemo(() => visibleTree(s), [s]);
  const layout = useMemo(() => layoutTree(v), [v]);
  const ids = Object.keys(v.nodes);
  const changed = prev && prev !== s ? changedNodes(prev, s) : NONE;
  const ptrChanged = prev && prev !== s ? changedPtrs(prev.ptrs, s.ptrs) : NONE;
  const aside = s.ptrs.filter((p) => typeof p.at !== 'string' || !Object.hasOwn(v.nodes, p.at));
  const ptrsAt = groupPtrs(s.ptrs.filter((p) => !aside.includes(p)));
  const back = new Set(layout.back.map(([a, b]) => `${a}>${b}`));
  const at = (n: NodeId) => ({ x: layout.pos[n].x * COL, y: layout.pos[n].y * ROW + PTR_H });
  const w = Math.max(1, layout.cols) * COL;
  const h = Math.max(1, layout.rows) * ROW;
  const marker = `lv-ah-${s.id}`;

  const edges: JSX.Element[] = [];
  for (const n of ids) {
    for (const side of ['left', 'right'] as const) {
      const c = v.nodes[n][side];
      if (!c) continue;
      const a = at(n);
      const b = at(c);
      const sx = side === 'left' ? a.x + 7 : a.x + NODE_W - 7;
      const sy = a.y + NODE_H + HANDLE_H;
      if (c === n) {
        // A self-loop drops from the handle, swings out past this side of the node and comes back into the value
        // box's side, so neither the node nor its chips hide it; it stays within the card's padding.
        const x = (dx: number) => (side === 'left' ? a.x + dx : a.x + NODE_W - dx);
        edges.push(
          <path key={n + side} class="lv-edge-back" d={`M${sx} ${sy}C${x(2)} ${sy + 18} ${x(-12)} ${a.y + 40} ${x(0)} ${a.y + 26}`} marker-end={`url(#${marker})`} />,
        );
        continue;
      }
      const ex = b.x + NODE_W / 2;
      // An edge up to an earlier row (a child wired to an ancestor) ends under the target, between its handles, and
      // bows below the straight line, so it crosses neither the target and its chips nor the ancestors in between.
      const up = layout.pos[c].y < layout.pos[n].y;
      const ey = up ? b.y + NODE_H + HANDLE_H : b.y;
      const bow = up ? (sx > ex ? -24 : 24) : 40;
      edges.push(
        back.has(`${n}>${c}`) ? (
          <path key={n + side} class="lv-edge-back" d={`M${sx} ${sy}Q${(sx + ex) / 2 + bow} ${(sy + ey) / 2} ${ex} ${ey}`} marker-end={`url(#${marker})`} />
        ) : (
          <path key={n + side} class="lv-edge" d={`M${sx} ${sy}L${ex} ${ey}`} />
        ),
      );
    }
  }

  function addNode() {
    const n = newNodeId(s);
    if (act({ t: 'node', s: s.id, val: '' })) startEdit({ t: 'val', at: { s: s.id, k: 'node', n } });
  }

  return (
    <div class="lv-tree-view">
      {ids.length === 0 ? (
        <span class="lv-empty">empty</span>
      ) : (
        <div class="lv-tree" style={{ width: `${w}px`, height: `${h}px` }}>
          <svg class="lv-links" width={w} height={h} aria-hidden="true">
            <defs>
              <marker id={marker} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                <path class="lv-arrow-head" d="M0 0L8 4L0 8z" />
              </marker>
            </defs>
            {edges}
          </svg>
          {ids.map((n) => {
            const { x, y } = at(n);
            const node = v.nodes[n];
            const here = ptrsAt.get(n);
            const loc = { s: s.id, k: 'node', n } as const;
            // The wrapper is the drop target, so a drop on this node's handles or pointer chips lands on the node.
            return (
              <div
                class="lv-tree-node"
                key={n}
                style={{ left: `${x}px`, top: `${y}px` }}
                data-drop={ro ? undefined : locKey(loc)}
              >
                {here && <PtrGroup class="lv-node-ptrs" s={s.id} ptrs={here} ro={ro} changed={ptrChanged} />}
                <Slot at={loc} val={node.val} text={node.val} ro={ro} changed={changed.has(n)} />
                <div class="lv-tree-handles">
                  <Handle s={s.id} n={n} side="left" ro={ro} set={s.nodes[n].left !== null} />
                  <Handle s={s.id} n={n} side="right" ro={ro} set={s.nodes[n].right !== null} />
                </div>
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
