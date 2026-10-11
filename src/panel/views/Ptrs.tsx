import { freePtrName } from '../model/ops';
import type { Id, Ptr, PtrAt, PtrS } from '../model/types';
import { act } from '../state';
import { PtrChip } from './PtrChip';

export function groupPtrs(ptrs: Ptr[]): Map<string, Ptr[]> {
  const out = new Map<string, Ptr[]>();
  for (const p of ptrs) {
    if (p.at === null) continue;
    const k = Array.isArray(p.at) ? `${p.at[0]},${p.at[1]}` : String(p.at);
    out.set(k, [...(out.get(k) ?? []), p]);
  }
  return out;
}

// Same as the array view (Plan 3): add the pointer; rename it later with F2 or a double-click.
export function addPtr(s: PtrS, at: PtrAt): void {
  act({ t: 'ptr', s: s.id, name: freePtrName(s.ptrs), at });
}

type GroupProps = { s: Id; ptrs: Ptr[]; ro: boolean; changed: Set<string> };

export function PtrGroup({ s, ptrs, ro, changed, class: cls }: GroupProps & { class: string }) {
  return (
    <div class={cls}>
      {ptrs.map((p) => (
        <PtrChip key={p.name} s={s} ptr={p} ro={ro} changed={changed.has(p.name)} />
      ))}
    </div>
  );
}

// Pointers with no drawn element to sit on: null, or past the render limit. Plan 3's array view
// lists these the same way, with the index.
export function AsidePtrs({ s, ptrs, ro, changed }: GroupProps) {
  return (
    <>
      {ptrs.map((p) => (
        <span class="lv-nullptr" key={p.name}>
          <PtrChip s={s} ptr={p} ro={ro} changed={changed.has(p.name)} />
          : {where(p.at)}
        </span>
      ))}
    </>
  );
}

function where(at: PtrAt): string {
  if (at === null) return 'null';
  return Array.isArray(at) ? `[${at[0]}, ${at[1]}]` : 'hidden';
}
