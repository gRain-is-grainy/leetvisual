import { locKey } from '../model/loc';
import { freePtrName } from '../model/ops';
import type { ArrayS, Ptr } from '../model/types';
import { act } from '../state';
import { startEdit } from '../ui';
import { Ctrl } from './Ctrl';
import { changedIdx, changedPtrs } from './diff';
import type { ViewProps } from './index';
import { MAX_ITEMS } from './limits';
import { PtrChip } from './PtrChip';
import { Slot } from './Slot';
import { shownText } from './text';

export function ArrayView({ s, prev, ro }: ViewProps<ArrayS>) {
  const ch = changedIdx(prev?.items, s.items);
  const cp = changedPtrs(prev?.ptrs, s.ptrs);
  const byIdx = new Map<number, Ptr[]>();
  const aside: Ptr[] = []; // null, or at a cell past the ones drawn
  for (const p of s.ptrs) {
    if (typeof p.at === 'number' && p.at < MAX_ITEMS) byIdx.set(p.at, [...(byIdx.get(p.at) ?? []), p]);
    else aside.push(p);
  }
  const chip = (p: Ptr) => <PtrChip key={p.name} s={s.id} ptr={p} ro={ro} changed={cp.has(p.name)} />;
  const append = () => {
    const i = s.items.length;
    if (act({ t: 'push', s: s.id, val: '' })) startEdit({ t: 'val', at: { s: s.id, k: 'item', i } });
  };
  return (
    <div class="lv-array">
      <div class="lv-cols">
        {s.items.slice(0, MAX_ITEMS).map((v, i) => {
          const at = { s: s.id, k: 'item', i } as const;
          // The whole column is the drop target, so a pointer dropped on the pointer row or the index lands on this cell.
          return (
            <div class="lv-col" key={i} data-drop={ro ? undefined : locKey(at)}>
              <div class="lv-ptrs">{(byIdx.get(i) ?? []).map(chip)}</div>
              <Slot at={at} val={v} text={shownText(v, !!s.chars)} ro={ro} changed={ch.has(i)} />
              <div class="lv-idx">{i}</div>
            </div>
          );
        })}
        {s.items.length > MAX_ITEMS && <div class="lv-more">+{s.items.length - MAX_ITEMS}</div>}
        {s.items.length === 0 && <div class="lv-empty">empty</div>}
      </div>
      {/* Controls stay rendered (disabled) on earlier frames so the card keeps its size while scrubbing. */}
      <div class="lv-ctrls">
        <Ctrl label="+" title="Append" disabled={ro} onClick={append} />
        <Ctrl label="−" title="Remove last" disabled={ro || !s.items.length} onClick={() => act({ t: 'pop', s: s.id })} />
        <Ctrl
          label="+ptr"
          title="Add pointer"
          disabled={ro}
          onClick={() => act({ t: 'ptr', s: s.id, name: freePtrName(s.ptrs), at: s.items.length ? 0 : null })}
        />
        {aside.map((p) => (
          <span class="lv-nullptr" key={p.name}>
            {chip(p)}: {p.at === null ? 'null' : String(p.at)}
          </span>
        ))}
      </div>
    </div>
  );
}
