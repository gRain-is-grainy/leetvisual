import { shown } from './state';

export function Shell() {
  const board = shown.value;
  if (!board) return null;
  return (
    <ul class="lv-shell" data-testid="shell">
      {Object.values(board.structs).map((s) => (
        <li key={s.id} data-card={s.id} data-kind={s.kind}>
          {s.name}
        </li>
      ))}
    </ul>
  );
}
