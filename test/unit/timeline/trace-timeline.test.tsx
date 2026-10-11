// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { lineText, TraceTimeline } from '../../../src/panel/timeline/TraceTimeline';
import type { End, Step, TraceResult } from '../../../src/panel/trace/types';
import { at, setMode, stepTo } from '../../../src/panel/tracer';
import { Workspace } from '../../../src/panel/Workspace';
import { arr, board, stubLayout } from '../../helpers/panel';
import { CODE, startTrace } from '../../helpers/trace';

const B = board(arr('t:nums', 'nums', ['2', '7']));
const STEPS: Step[] = [
  { board: B, line: 2, ev: 'call', depth: 1, fn: 'twoSum' },
  { board: B, line: 3, ev: 'line', depth: 1, fn: 'twoSum' },
  { board: B, line: 4, ev: 'return', depth: 1, fn: 'twoSum', detail: '[0, 1]' },
];
const traceOf = (steps: Step[] = STEPS, end: End = { kind: 'return', value: '[0, 1]' }, code = CODE): TraceResult => ({
  steps,
  end,
  truncated: false,
  code,
});
const el = (id: string) => screen.getByTestId(id);
const btn = (id: string) => el(id) as HTMLButtonElement;
const scrub = () => el('trace-scrubber') as HTMLInputElement;

beforeAll(() => stubLayout());
afterEach(cleanup);

async function show(r: TraceResult): Promise<void> {
  await startTrace(r, { 't:nums': { x: 16, y: 16 } });
  render(<TraceTimeline />);
}

describe('TraceTimeline', () => {
  it('labels the step, disables ‹ on the first step and › on the last, and sets the scrubber', async () => {
    await show(traceOf());
    expect(el('trace-step').textContent).toBe('Step 1 / 3');
    expect([scrub().min, scrub().max, scrub().value]).toEqual(['0', '2', '0']);
    expect(scrub().getAttribute('aria-valuetext')).toBe('Step 1 / 3');
    expect(btn('trace-prev').disabled).toBe(true);
    expect(btn('trace-next').disabled).toBe(false);
    stepTo(2);
    await waitFor(() => expect(el('trace-step').textContent).toBe('Step 3 / 3'));
    expect(btn('trace-next').disabled).toBe(true);
  });

  it('moves with ‹, › and the scrubber', async () => {
    await show(traceOf());
    fireEvent.click(btn('trace-next'));
    expect(at.value).toBe(1);
    fireEvent.click(btn('trace-prev'));
    expect(at.value).toBe(0);
    scrub().value = '2';
    fireEvent.input(scrub());
    expect(at.value).toBe(2);
  });

  it("shows the traced line's number and text, trimmed, with the full text as its title", async () => {
    const long = `        x = "${'a'.repeat(300)}"`;
    await show(traceOf([{ board: B, line: 3, ev: 'line', depth: 1, fn: 'f' }], undefined, `class Solution:\r\n    def f(self):\r\n${long}\r\n`));
    const line = el('trace-line');
    expect(line.textContent).toBe(`3  x = "${'a'.repeat(300)}"`);
    expect(line.getAttribute('title')).toBe(line.textContent);
  });

  it('shows a call, return or exception chip, and none on a line step', async () => {
    await show(
      traceOf([
        { board: B, line: 2, ev: 'call', depth: 2, fn: 'dfs' },
        { board: B, line: 3, ev: 'line', depth: 2, fn: 'dfs' },
        { board: B, line: 4, ev: 'return', depth: 2, fn: 'dfs', detail: '3' },
        { board: B, line: 5, ev: 'exception', depth: 1, fn: 'twoSum', detail: 'ValueError: list index out of range' },
      ]),
    );
    expect(el('trace-event').textContent).toBe('call dfs');
    stepTo(1);
    await waitFor(() => expect(screen.queryByTestId('trace-event')).toBeNull());
    stepTo(2);
    await waitFor(() => expect(el('trace-event').textContent).toBe('return 3'));
    stepTo(3);
    await waitFor(() => expect(el('trace-event').textContent).toBe('ValueError'));
    expect(el('trace-event').classList.contains('lv-chip-err')).toBe(true);
    expect(el('trace-event').getAttribute('title')).toBe('ValueError: list index out of range');
  });

  it('shows the end text on the last step only', async () => {
    await show(traceOf());
    expect(screen.queryByTestId('trace-end')).toBeNull();
    stepTo(2);
    await waitFor(() => expect(el('trace-end').textContent).toBe('Returned [0, 1]'));
  });

  it.each<[End, string, boolean]>([
    [{ kind: 'exception', type: 'ValueError', msg: 'list index out of range', line: 7 }, 'ValueError: list index out of range (line 7)', true],
    [{ kind: 'cap', cap: 'steps' }, 'Stopped after 10,000 steps', false],
    [{ kind: 'return' }, 'Finished', false],
  ])('reads %o as %s at the end', async (end, text, err) => {
    await show(traceOf([STEPS[0]], end));
    expect(el('trace-end').textContent).toBe(text);
    expect(el('trace-end').classList.contains('lv-trace-end-err')).toBe(err);
  });
});

describe('lineText', () => {
  it('returns the trimmed line without carriage returns, or nothing past the end', () => {
    expect(lineText('a\r\n    b = 1  \r\n', 2)).toBe('b = 1');
    expect(lineText('a\n', 5)).toBe('');
  });
});

describe('Workspace timelines', () => {
  it('replaces the canvas timeline with the trace timeline in Trace mode', async () => {
    await startTrace(traceOf(), { 't:nums': { x: 16, y: 16 } });
    render(<Workspace />);
    expect(el('trace-timeline')).toBeTruthy();
    expect(screen.queryByTestId('timeline')).toBeNull();
    setMode('canvas');
    await waitFor(() => expect(el('timeline')).toBeTruthy());
    expect(screen.queryByTestId('trace-timeline')).toBeNull();
  });

  it('shows no trace timeline before the first trace', async () => {
    await startTrace(null);
    render(<Workspace />);
    expect(screen.queryByTestId('trace-timeline')).toBeNull();
  });
});
