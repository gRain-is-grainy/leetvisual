import { useEffect, useRef } from 'preact/hooks';

type EditProps = { value: string; label: string; onCommit(v: string): void; onCancel(): void };

export function Edit({ value, label, onCommit, onCancel }: EditProps) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit) onCommit(ref.current!.value.trim());
    else onCancel();
  };
  return (
    <input
      ref={ref}
      class="lv-edit"
      aria-label={label}
      defaultValue={value}
      size={Math.max(2, value.length + 1)}
      spellcheck={false}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}
