import { shown } from './state';
import { mode, traced } from './tracer';
import { isLarge } from './views/limits';

export function Banner() {
  if (mode.value === 'trace') {
    const t = traced.value;
    if (t.t !== 'trace' || !t.result.truncated) return null;
    return (
      <div class="lv-banner" role="note" data-testid="banner">
        Large input: each structure shows its first 200 items. Try a smaller custom test case.
      </div>
    );
  }
  const b = shown.value;
  if (!b || !Object.values(b.structs).some(isLarge)) return null;
  return (
    <div class="lv-banner" role="note" data-testid="banner">
      Large input: only the first part is drawn. Try a smaller custom test case.
    </div>
  );
}
