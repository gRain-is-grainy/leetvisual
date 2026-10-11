import { locKey } from '../model/loc';
import type { MapS } from '../model/types';
import { act } from '../state';
import { startEdit } from '../ui';
import { Ctrl } from './Ctrl';
import { changedEntries } from './diff';
import type { ViewProps } from './index';
import { MAX_ITEMS } from './limits';
import { Slot } from './Slot';

const NONE = new Set<number>();

export function MapView({ s, prev, ro }: ViewProps<MapS>) {
  const changed = prev !== undefined && prev !== s ? changedEntries(prev, s) : NONE;

  function addEntry() {
    const i = s.entries.findIndex(([k]) => k === '');
    if (i >= 0) {
      startEdit({ t: 'val', at: { s: s.id, k: 'key', i } });
      return;
    }
    if (act({ t: 'putKey', s: s.id, key: '' })) startEdit({ t: 'val', at: { s: s.id, k: 'key', i: s.entries.length } });
  }

  return (
    <div class="lv-map">
      {s.entries.length === 0 && <span class="lv-empty">empty</span>}
      {s.entries.slice(0, MAX_ITEMS).map(([key, val], i) => (
        <div class="lv-map-row" key={i}>
          <Slot at={{ s: s.id, k: 'key', i }} val={key} text={key} ro={ro} drop changed={changed.has(i)} class="lv-map-key" />
          <span class="lv-sep" aria-hidden="true">:</span>
          <Slot at={{ s: s.id, k: 'val', i }} val={val} text={val} ro={ro} drop changed={changed.has(i)} />
          {/* The mouse path for deleting an entry; Delete on a key or value does the same. */}
          <Ctrl label="×" title="Delete entry" onClick={() => act({ t: 'del', at: { s: s.id, k: 'key', i } })} disabled={ro} />
        </div>
      ))}
      <div class="lv-ctrls">
        <span class="lv-add-drop" data-drop={ro ? undefined : locKey({ s: s.id, k: 'add' })}>
          <Ctrl label="+ key" title="Add entry" onClick={addEntry} disabled={ro} />
        </span>
      </div>
    </div>
  );
}
