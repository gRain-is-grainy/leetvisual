import { locKey } from '../model/loc';
import type { BagS } from '../model/types';
import { act } from '../state';
import { startEdit } from '../ui';
import { Ctrl } from './Ctrl';
import { changedBag } from './diff';
import type { ViewProps } from './index';
import { MAX_ITEMS } from './limits';
import { Slot } from './Slot';

const NONE = new Set<number>();
const LABEL = { set: '', stack: 'top', queue: 'front' };

export function BagView({ s, prev, ro }: ViewProps<BagS>) {
  const changed = prev !== undefined && prev !== s ? changedBag(prev, s) : NONE;
  const n = s.items.length;
  const shownCount = Math.min(n, MAX_ITEMS);
  const order = Array.from({ length: shownCount }, (_, j) => (s.kind === 'stack' ? n - 1 - j : j));

  function add() {
    const empty = s.kind === 'set' ? s.items.indexOf('') : -1;
    if (empty >= 0) {
      startEdit({ t: 'val', at: { s: s.id, k: 'item', i: empty } });
      return;
    }
    if (act({ t: 'push', s: s.id, val: '' })) startEdit({ t: 'val', at: { s: s.id, k: 'item', i: n } });
  }

  const slot = (i: number) => (
    <Slot key={i} at={{ s: s.id, k: 'item', i }} val={s.items[i]} text={s.items[i]} ro={ro} changed={changed.has(i)} />
  );

  return (
    <div class={`lv-bag lv-bag-${s.kind}`}>
      <div class="lv-bag-items" data-drop={ro ? undefined : locKey({ s: s.id, k: 'add' })}>
        {n === 0 && <span class="lv-empty">empty</span>}
        {n > 0 && LABEL[s.kind] && <span class="lv-bag-label">{LABEL[s.kind]}</span>}
        {/* Set items get a × as their mouse path for removal; stacks and queues use pop and dequeue. */}
        {order.map((i) =>
          s.kind === 'set' ? (
            <span class="lv-bag-item" key={i}>
              {slot(i)}
              <Ctrl label="×" title="Remove item" onClick={() => act({ t: 'del', at: { s: s.id, k: 'item', i } })} disabled={ro} />
            </span>
          ) : (
            slot(i)
          ),
        )}
      </div>
      <div class="lv-ctrls">
        {s.kind === 'set' && <Ctrl label="+ item" title="Add item" onClick={add} disabled={ro} />}
        {s.kind === 'stack' && (
          <>
            <Ctrl label="push" title="Push" onClick={add} disabled={ro} />
            <Ctrl label="pop" title="Pop" onClick={() => act({ t: 'pop', s: s.id })} disabled={ro || n === 0} />
          </>
        )}
        {s.kind === 'queue' && (
          <>
            <Ctrl label="enqueue" title="Enqueue" onClick={add} disabled={ro} />
            <Ctrl label="dequeue" title="Dequeue" onClick={() => act({ t: 'shift', s: s.id })} disabled={ro || n === 0} />
          </>
        )}
      </div>
    </div>
  );
}
