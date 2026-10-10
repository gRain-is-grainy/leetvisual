// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ContextMsg } from '../../../src/shared/messages';
import { App } from '../../../src/panel/app';
import { newCanvas } from '../../../src/panel/model/history';
import type { KV } from '../../../src/panel/store/kv';
import { canvasKey, loadCanvas, saveCanvas } from '../../../src/panel/store/store';
import {
  act,
  canvas,
  continueHere,
  flushSaves,
  initState,
  notice,
  openContext,
  pendingLine,
  prevShown,
  readOnly,
  session,
  setLineAt,
  setTheme,
  shown,
  showNotice,
  step,
  theme,
  undoAct,
  view,
  viewBy,
  viewing,
} from '../../../src/panel/state';
import { memoryKV } from '../../helpers/memory-kv';

const TWO_SUM: ContextMsg = {
  type: 'context',
  slug: 'two-sum',
  metaData: { name: 'twoSum', params: [{ name: 'nums', type: 'integer[]' }, { name: 'target', type: 'integer' }] },
  inputs: ['[2,7,11,15]', '9'],
  theme: 'light',
};
const OTHER_CASE: ContextMsg = { ...TWO_SUM, inputs: ['[3,2,4]', '6'] };

let kv: ReturnType<typeof memoryKV>;
const kinds = () => Object.values(shown.value!.structs).map((s) => s.kind);
const names = () => Object.values(shown.value!.structs).map((s) => s.name);
const firstId = () => Object.keys(shown.value!.structs)[0];

beforeEach(() => {
  session.value = null;
  viewing.value = null;
  pendingLine.value = undefined;
  notice.value = null;
  theme.value = 'light';
  kv = memoryKV();
  initState(kv);
});

afterEach(cleanup);

describe('openContext', () => {
  it('seeds a fresh canvas from the inputs on first open', async () => {
    await openContext(TWO_SUM);
    expect(session.value?.key).toBe(canvasKey('two-sum', TWO_SUM.inputs));
    expect(kinds()).toEqual(['array', 'var']);
    expect(canvas.value?.frames).toHaveLength(1);
    expect(viewing.value).toBeNull();
  });

  it('loads a saved canvas instead of seeding', async () => {
    const key = canvasKey('two-sum', TWO_SUM.inputs);
    await saveCanvas(kv, key, newCanvas({ structs: { s9: { id: 's9', name: 'saved', kind: 'var', value: '1' } } }));
    await openContext(TWO_SUM);
    expect(names()).toEqual(['saved']);
  });

  it('ignores a context with the same key except for its theme', async () => {
    await openContext(TWO_SUM);
    const before = session.value;
    await openContext({ ...TWO_SUM, theme: 'dark' });
    expect(session.value).toBe(before);
    expect(theme.value).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('flushes the pending save of the old canvas before switching cases', async () => {
    await openContext(TWO_SUM);
    act({ t: 'rename', s: firstId(), name: 'arr' });
    await openContext(OTHER_CASE);
    expect(names()).toEqual(['nums', 'target']);
    const saved = await loadCanvas(kv, canvasKey('two-sum', TWO_SUM.inputs));
    expect(Object.values(saved!.draft.structs)[0].name).toBe('arr');
  });

  it('lets the last of two overlapping opens win', async () => {
    const a = openContext(TWO_SUM);
    const b = openContext(OTHER_CASE);
    await Promise.all([a, b]);
    expect(session.value?.key).toBe(canvasKey('two-sum', OTHER_CASE.inputs));
  });

  it('drops an older open when the shown canvas comes back before it finishes', async () => {
    await openContext(TWO_SUM);
    const b = openContext(OTHER_CASE);
    const a = openContext(TWO_SUM);
    await Promise.all([a, b]);
    expect(session.value?.key).toBe(canvasKey('two-sum', TWO_SUM.inputs));
  });

  it('does not save a canvas that was only loaded', async () => {
    await openContext(TWO_SUM);
    await flushSaves();
    expect(kv.data.has(canvasKey('two-sum', TWO_SUM.inputs))).toBe(false);
  });
});

describe('editing and frames', () => {
  beforeEach(() => openContext(TWO_SUM));

  it('refuses Next step at 500 frames with a notice', () => {
    for (let i = 1; i < 500; i++) step();
    expect(canvas.value?.frames).toHaveLength(500);
    step();
    expect(canvas.value?.frames).toHaveLength(500);
    expect(notice.value).toBe('Frame limit reached (500).');
  });

  it('ignores edits and Next step while viewing an earlier frame', () => {
    step();
    view(0);
    expect(readOnly.value).toBe(true);
    expect(act({ t: 'rename', s: firstId(), name: 'arr' })).toBe(false);
    step();
    expect(canvas.value?.frames).toHaveLength(2);
    view(null);
    expect(act({ t: 'rename', s: firstId(), name: 'arr' })).toBe(true);
    expect(act({ t: 'rename', s: firstId(), name: 'arr' })).toBe(false);
  });

  it('moves between frames with viewBy and clamps at both ends', () => {
    step();
    step();
    viewBy(1);
    expect(viewing.value).toBeNull();
    viewBy(-1);
    expect(viewing.value).toBe(2);
    viewBy(-1);
    viewBy(-1);
    expect(viewing.value).toBe(0);
    viewBy(-1);
    expect(viewing.value).toBe(0);
    expect(prevShown.value).toBeUndefined();
    viewBy(1);
    expect(prevShown.value).toBe(canvas.value!.frames[0].board);
    viewBy(1);
    viewBy(1);
    expect(viewing.value).toBeNull();
    view(99);
    expect(viewing.value).toBeNull();
  });

  it('continues from an earlier frame and drops the frames after it', () => {
    act({ t: 'rename', s: firstId(), name: 'a1' });
    step();
    act({ t: 'rename', s: firstId(), name: 'a2' });
    step();
    view(1);
    continueHere();
    expect(viewing.value).toBeNull();
    expect(canvas.value!.frames).toHaveLength(2);
    expect(canvas.value!.draft).toBe(canvas.value!.frames[1].board);
    expect(names()[0]).toBe('a1');
    undoAct();
    expect(canvas.value!.frames).toHaveLength(3);
  });

  it('attaches the pending line tag to the next frame', () => {
    setLineAt(null, 7);
    step();
    expect(canvas.value!.frames[1].line).toBe(7);
    expect(pendingLine.value).toBeUndefined();
    setLineAt(1, 9);
    expect(canvas.value!.frames[1].line).toBe(9);
  });

  it("shows Couldn't save this canvas. when saving fails", async () => {
    let failing = false;
    const flaky: KV = {
      get: (k) => kv.get(k),
      remove: (k) => kv.remove(k),
      keys: () => kv.keys(),
      set: async (k, v) => {
        if (failing) throw new Error('QUOTA_BYTES quota exceeded');
        return kv.set(k, v);
      },
    };
    session.value = null;
    initState(flaky);
    await openContext(TWO_SUM);
    failing = true;
    act({ t: 'rename', s: firstId(), name: 'arr' });
    await flushSaves();
    expect(notice.value).toBe("Couldn't save this canvas.");
  });
});

describe('App', () => {
  it('shows the waiting text until the first context arrives', async () => {
    render(<App />);
    expect(screen.getByTestId('waiting').textContent).toBe('Waiting for LeetCode…');
    await openContext(TWO_SUM);
    await waitFor(() => expect(screen.queryByTestId('waiting')).toBeNull());
  });

  it('shows a notice that can be dismissed', async () => {
    render(<App />);
    showNotice('Frame limit reached (500).');
    expect((await screen.findByTestId('notice')).textContent).toContain('Frame limit reached (500).');
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(screen.queryByTestId('notice')).toBeNull();
  });

  it('sets the theme on the document', () => {
    setTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
