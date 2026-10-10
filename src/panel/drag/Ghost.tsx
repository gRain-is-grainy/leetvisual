import { drag } from '../ui';

export function Ghost() {
  const d = drag.value;
  if (!d) return null;
  if (d.mode === 'pointer') {
    return (
      <div class="lv-ghost" style={{ left: `${d.x + 10}px`, top: `${d.y + 10}px` }}>
        {d.label}
      </div>
    );
  }
  const t = d.targets[d.ti];
  return (
    <div class="lv-kbdrag" role="status" data-testid="kb-drag">
      Moving {d.label} to {t === null ? 'empty space' : `target ${d.ti + 1} of ${d.targets.length}`}. Space drops, Esc cancels.
    </div>
  );
}
