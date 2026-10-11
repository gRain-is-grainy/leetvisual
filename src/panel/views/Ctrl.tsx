type CtrlProps = { label: string; title: string; onClick(): void; disabled?: boolean; testid?: string };

export function Ctrl({ label, title, onClick, disabled, testid }: CtrlProps) {
  return (
    <button type="button" class="lv-ctrl" title={title} aria-label={title} disabled={disabled} data-testid={testid} onClick={onClick}>
      {label}
    </button>
  );
}
