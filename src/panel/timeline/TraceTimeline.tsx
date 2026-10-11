import type { Step } from '../trace/types';
import { at, endText, stepBy, stepTo, traced } from '../tracer';

// From the code that was traced, not the editor's, so the line still reads right after an edit (spec §5.2).
export function lineText(code: string, line: number): string {
  return (code.split('\n')[line - 1] ?? '').replace(/\r/g, '').trim();
}

// Decision 23: no chip on line steps.
function chip(s: Step): string | null {
  if (s.ev === 'call') return `call ${s.fn}`;
  if (s.ev === 'return') return s.detail === undefined ? 'return' : `return ${s.detail}`;
  if (s.ev === 'exception') return (s.detail ?? 'Exception').split(': ')[0];
  return null;
}

export function TraceTimeline() {
  const t = traced.value;
  if (t.t !== 'trace') return null;
  const { steps, end, code } = t.result;
  const n = steps.length;
  const k = at.value;
  const s = steps[k];
  const label = `Step ${k + 1} / ${n}`;
  const line = `${s.line}  ${lineText(code, s.line)}`;
  const ev = chip(s);
  const done = k === n - 1 ? endText(end) : null;
  return (
    <div class="lv-timeline" data-testid="trace-timeline">
      <button type="button" class="lv-ctrl" data-testid="trace-prev" aria-label="Previous step" title="Previous step ([)" disabled={k === 0} onClick={() => stepBy(-1)}>
        ‹
      </button>
      <input
        type="range"
        class="lv-scrubber"
        data-testid="trace-scrubber"
        min={0}
        max={n - 1}
        value={k}
        aria-label="Step"
        aria-valuetext={label}
        onInput={(e) => stepTo(Number(e.currentTarget.value))}
      />
      <button type="button" class="lv-ctrl" data-testid="trace-next" aria-label="Next step" title="Next step (])" disabled={k === n - 1} onClick={() => stepBy(1)}>
        ›
      </button>
      <span class="lv-frame-label" data-testid="trace-step">
        {label}
      </span>
      <span class="lv-trace-line" data-testid="trace-line" title={line}>
        {line}
      </span>
      {ev && (
        <span class={s.ev === 'exception' ? 'lv-chip lv-chip-err' : 'lv-chip'} data-testid="trace-event" title={s.detail ?? ev}>
          {ev}
        </span>
      )}
      {done !== null && (
        <span class={end.kind === 'exception' ? 'lv-trace-end lv-trace-end-err' : 'lv-trace-end'} data-testid="trace-end" title={done}>
          {done}
        </span>
      )}
    </div>
  );
}
