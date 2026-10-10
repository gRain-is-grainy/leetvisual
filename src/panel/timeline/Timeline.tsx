import { canvas, continueHere, pendingLine, redoAct, session, setLineAt, step, undoAct, view, viewBy, viewing } from '../state';

const MAC = navigator.platform.startsWith('Mac');

function parseLine(text: string): number | undefined | null {
  const t = text.trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isInteger(n) && n >= 1 ? n : null; // null = invalid, keep the old tag
}

export function Timeline() {
  const c = canvas.value!;
  const h = session.value!.hist;
  const n = c.frames.length;
  const v = viewing.value;
  const pos = v ?? n;
  const label = v === null ? 'Draft' : v === 0 ? 'Start' : `Step ${v}`;
  const line = v === null ? pendingLine.value : c.frames[v].line;
  return (
    <div class="lv-timeline" data-testid="timeline">
      <button type="button" class="lv-ctrl" data-testid="undo" aria-label="Undo" title={MAC ? 'Undo (⌘Z)' : 'Undo (Ctrl+Z)'} disabled={!h.past.length} onClick={undoAct}>
        ↶
      </button>
      <button type="button" class="lv-ctrl" data-testid="redo" aria-label="Redo" title={MAC ? 'Redo (⇧⌘Z)' : 'Redo (Ctrl+Y)'} disabled={!h.future.length} onClick={redoAct}>
        ↷
      </button>
      <button type="button" class="lv-ctrl" data-testid="prev-frame" aria-label="Previous frame" title="Previous frame ([)" disabled={pos === 0} onClick={() => viewBy(-1)}>
        ‹
      </button>
      <input
        type="range"
        class="lv-scrubber"
        data-testid="scrubber"
        min={0}
        max={n}
        value={pos}
        aria-label="Frame"
        aria-valuetext={label}
        onInput={(e) => view(Number(e.currentTarget.value))}
      />
      <button type="button" class="lv-ctrl" data-testid="next-frame" aria-label="Next frame" title="Next frame (])" disabled={v === null} onClick={() => viewBy(1)}>
        ›
      </button>
      <span class="lv-frame-label" data-testid="frame-label">
        {label}
      </span>
      <input
        type="number"
        class="lv-line"
        data-testid="line-tag"
        min={1}
        step={1}
        placeholder="line"
        aria-label="Code line for this frame"
        value={line ?? ''}
        onChange={(e) => {
          const input = e.currentTarget;
          const parsed = parseLine(input.value);
          if (parsed === null) input.value = line === undefined ? '' : String(line); // show the tag that is kept
          else setLineAt(v, parsed);
        }}
      />
      {v === null ? (
        <button type="button" class="lv-ctrl lv-primary" data-testid="next-step" title="Next step (Enter)" onClick={step}>
          Next step
        </button>
      ) : (
        <button type="button" class="lv-ctrl" data-testid="continue" onClick={continueHere}>
          Continue from here
        </button>
      )}
    </div>
  );
}
