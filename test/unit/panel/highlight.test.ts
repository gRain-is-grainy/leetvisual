// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Step } from '../../../src/panel/trace/types';
import { onCodeChanged, onContext, setMode, stepTo, traced } from '../../../src/panel/tracer';
import { board, vr } from '../../helpers/panel';
import { result, startTrace, TWO_SUM, type FakeDeps } from '../../helpers/trace';

const B = [board(vr('t:x', 'x', '1')), board(vr('t:x', 'x', '2')), board(vr('t:x', 'x', '3'))];
let d: FakeDeps;
const lines = () => d.sent.filter((m) => m.type === 'line');
const frame = () => vi.advanceTimersToNextFrame();

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame'] });
  d = await startTrace(result(B)); // steps on lines 2, 3, 4
});
afterEach(() => vi.useRealTimers());

describe('Monaco highlight', () => {
  it("highlights the current step's line, once per animation frame while scrubbing", () => {
    expect(lines()).toEqual([]);
    frame();
    expect(lines()).toEqual([{ type: 'line', line: 2 }]);
    stepTo(1);
    stepTo(2);
    expect(lines()).toHaveLength(1);
    frame();
    expect(lines()).toEqual([{ type: 'line', line: 2 }, { type: 'line', line: 4 }]);
    stepTo(1);
    stepTo(2); // back where it was before the frame
    frame();
    expect(lines()).toHaveLength(2);
  });

  it('tints an exception step', () => {
    const steps: Step[] = [{ board: B[0], line: 5, ev: 'exception', depth: 1, fn: 'twoSum', detail: 'ValueError: bad' }];
    traced.value = { t: 'trace', result: { ...result(B), steps } };
    frame();
    expect(lines()).toEqual([{ type: 'line', line: 5, err: true }]);
  });

  it("tints a syntax error's line and clears it for a message without a line", () => {
    traced.value = { t: 'msg', text: 'SyntaxError: invalid syntax (line 4)', line: 4 };
    frame();
    expect(lines()).toEqual([{ type: 'line', line: 4, err: true }]);
    traced.value = { t: 'msg', text: "Couldn't start Python." };
    expect(lines().at(-1)).toEqual({ type: 'line', line: null });
  });

  it('clears at once when the trace goes stale', () => {
    frame();
    vi.advanceTimersByTime(500);
    onCodeChanged();
    expect(lines().at(-1)).toEqual({ type: 'line', line: null });
  });

  it('clears at once in Canvas mode and draws the line again back in Trace mode', () => {
    frame();
    setMode('canvas');
    expect(lines().at(-1)).toEqual({ type: 'line', line: null });
    setMode('trace');
    frame();
    expect(lines().at(-1)).toEqual({ type: 'line', line: 2 });
  });

  it('clears at once when another problem opens', async () => {
    frame();
    await onContext({ ...TWO_SUM, slug: 'add-two-numbers' });
    expect(lines().at(-1)).toEqual({ type: 'line', line: null });
  });

  it('drops a pending move when the line is cleared first, and sends no clear for a line never drawn', () => {
    stepTo(1);
    setMode('canvas');
    frame();
    expect(lines()).toEqual([]);
  });
});
