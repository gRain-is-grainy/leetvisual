import type { CallFrame, CallsS } from '../model/types';
import { act } from '../state';
import { startEdit } from '../ui';
import { Ctrl } from './Ctrl';
import { changedFrames } from './diff';
import type { ViewProps } from './index';
import { MAX_ITEMS } from './limits';
import { Slot } from './Slot';

const NONE = new Set<number>();

function freeLocal(f: CallFrame): string {
  const used = new Set(f.locals.map(([n]) => n));
  if (!used.has('x')) return 'x';
  for (let i = 2; ; i++) if (!used.has(`x${i}`)) return `x${i}`;
}

export function CallsView({ s, prev, ro }: ViewProps<CallsS>) {
  const changed = prev !== undefined && prev !== s ? changedFrames(prev, s) : NONE;
  const n = s.frames.length;
  const top = n - 1;
  const order = Array.from({ length: Math.min(n, MAX_ITEMS) }, (_, j) => n - 1 - j);

  function addLocal() {
    const f = s.frames[top];
    if (!f) return;
    if (act({ t: 'local', s: s.id, f: top, name: freeLocal(f) })) {
      startEdit({ t: 'val', at: { s: s.id, k: 'lname', f: top, i: f.locals.length } });
    }
  }

  return (
    <div class="lv-calls">
      {n === 0 && <span class="lv-empty">empty</span>}
      {order.map((f) => {
        const fr = s.frames[f];
        const cls = `lv-frame${f === top ? ' lv-frame-top' : ''}${changed.has(f) ? ' lv-changed' : ''}`;
        return (
          <div class={cls} key={f}>
            <div class="lv-frame-head">
              <Slot at={{ s: s.id, k: 'fn', f }} val={fr.fn} text={fr.fn} ro={ro} drag={false} class="lv-fn" />
              <span class="lv-sep" aria-hidden="true">()</span>
            </div>
            {fr.locals.map(([name, val], i) => (
              <div class="lv-local" key={i}>
                <Slot at={{ s: s.id, k: 'lname', f, i }} val={name} text={name} ro={ro} drag={false} class="lv-lname" />
                <span class="lv-sep" aria-hidden="true">=</span>
                <Slot at={{ s: s.id, k: 'local', f, i }} val={val} text={val} ro={ro} drop />
              </div>
            ))}
          </div>
        );
      })}
      <div class="lv-ctrls">
        <Ctrl label="push" title="Push frame" onClick={() => act({ t: 'call', s: s.id })} disabled={ro} />
        <Ctrl label="pop" title="Pop frame" onClick={() => act({ t: 'ret', s: s.id })} disabled={ro || n === 0} />
        <Ctrl label="+ local" title="Add local" onClick={addLocal} disabled={ro || n === 0} />
      </div>
    </div>
  );
}
