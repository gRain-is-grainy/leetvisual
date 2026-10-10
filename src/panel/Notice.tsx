import { notice } from './state';

export function Notice() {
  const text = notice.value;
  if (!text) return null;
  return (
    <div class="lv-notice" role="status" data-testid="notice">
      <span>{text}</span>
      <button type="button" class="lv-notice-x" aria-label="Dismiss" onClick={() => (notice.value = null)}>
        ×
      </button>
    </div>
  );
}
