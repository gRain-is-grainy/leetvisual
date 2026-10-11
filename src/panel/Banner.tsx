import { shown } from './state';
import { isLarge } from './views/limits';

export function Banner() {
  const b = shown.value;
  if (!b || !Object.values(b.structs).some(isLarge)) return null;
  return (
    <div class="lv-banner" role="note" data-testid="banner">
      Large input: only the first part is drawn. Try a smaller custom test case.
    </div>
  );
}
