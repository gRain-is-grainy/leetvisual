import { useEffect, useRef } from 'preact/hooks';
import { locKey } from '../model/loc';
import type { GridS, PtrAt } from '../model/types';
import { isStr } from '../parse/tokens';
import { act } from '../state';
import { startEdit } from '../ui';
import { Ctrl } from './Ctrl';
import { changedCells, changedPtrs } from './diff';
import type { ViewProps } from './index';
import { MAX_GRID } from './limits';
import { addPtr, AsidePtrs, groupPtrs, PtrGroup } from './Ptrs';
import { Slot } from './Slot';
import { shownText } from './text';

const NONE = new Set<string>();
const MARK_DELAY = 250;

type Pending = { k: string; t: ReturnType<typeof setTimeout>; run: () => void };

export function GridView({ s, prev, ro }: ViewProps<GridS>) {
  const pending = useRef<Pending | null>(null);
  // A click pending when the grid unmounts (card deleted, or a canvas switch that drops this grid) must not mark later.
  // A switch to a canvas with a grid at the same id keeps this view mounted and is not covered here; the 250 ms delay
  // is shorter than the content script's 300 ms context debounce, which keeps that case rare.
  useEffect(() => () => void cancel(), []);
  const cells = s.rows.flat();
  const unquote = cells.length > 0 && cells.every(isStr);
  const changed = prev && prev !== s ? changedCells(prev, s) : NONE;
  const ptrChanged = prev && prev !== s ? changedPtrs(prev.ptrs, s.ptrs) : NONE;
  const marked = new Set(s.marked);
  // Decision 11: null, or outside the drawn cells (a trace cursor can be negative, past its row or past the last row).
  const inside = (at: PtrAt) =>
    Array.isArray(at) &&
    at[0] >= 0 &&
    at[0] < Math.min(s.rows.length, MAX_GRID) &&
    at[1] >= 0 &&
    at[1] < Math.min(s.rows[at[0]].length, MAX_GRID);
  const aside = s.ptrs.filter((p) => !inside(p.at));
  const ptrsAt = groupPtrs(s.ptrs.filter((p) => !aside.includes(p)));

  function cancel(): Pending | null {
    const p = pending.current;
    if (p) clearTimeout(p.t);
    pending.current = null;
    return p;
  }

  function click(e: MouseEvent, r: number, c: number) {
    if (ro) return;
    const k = `${r},${c}`;
    const clicks = e.detail || 1;
    const p = cancel();
    if (p && (p.k !== k || clicks === 1)) p.run();
    if (clicks > 1) return;
    const run = () => {
      pending.current = null;
      act({ t: 'mark', s: s.id, r, c });
    };
    pending.current = { k, t: setTimeout(run, MARK_DELAY), run };
  }

  function dblClick(r: number, c: number) {
    cancel();
    startEdit({ t: 'val', at: { s: s.id, k: 'cell', r, c } });
  }

  return (
    <div class="lv-grid-view">
      <div class={ptrsAt.size > 0 ? 'lv-grid lv-grid-has-ptrs' : 'lv-grid'}>
        {s.rows.slice(0, MAX_GRID).map((row, r) => (
          <div class="lv-grid-row" key={r}>
            {row.slice(0, MAX_GRID).map((v, c) => {
              const k = `${r},${c}`;
              const at = { s: s.id, k: 'cell', r, c } as const;
              const here = ptrsAt.get(k);
              // The wrapper is the drop target, so a drop on the pointer chips above the cell lands on the cell.
              return (
                <div
                  class="lv-grid-cell"
                  key={c}
                  style={{ gridRow: String(r + 1), gridColumn: String(c + 1) }}
                  data-drop={ro ? undefined : locKey(at)}
                >
                  {here && <PtrGroup class="lv-grid-ptrs" s={s.id} ptrs={here} ro={ro} changed={ptrChanged} />}
                  <Slot
                    at={at}
                    val={v}
                    text={shownText(v, unquote)}
                    ro={ro}
                    changed={changed.has(k)}
                    class={marked.has(k) ? 'lv-marked' : undefined}
                    onClick={(e) => click(e, r, c)}
                    onDblClick={() => dblClick(r, c)}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div class="lv-ctrls">
        <Ctrl label="+ptr" title="Add pointer" onClick={() => addPtr(s, s.rows[0]?.length ? [0, 0] : null)} disabled={ro} />
        <AsidePtrs s={s.id} ptrs={aside} ro={ro} changed={ptrChanged} />
      </div>
    </div>
  );
}
