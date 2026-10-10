import type { Val } from '../model/types';
import { isStr } from '../parse/tokens';

// JSON.parse is safe here: the token is a quoted string, never a number.
export function shownText(val: Val, unquote: boolean): string {
  if (!unquote || !isStr(val)) return val;
  try {
    const s: unknown = JSON.parse(val);
    return typeof s === 'string' ? s : val;
  } catch {
    return val.slice(1, -1);
  }
}
