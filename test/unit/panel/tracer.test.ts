// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CAPS } from '../../../src/panel/trace/raw';
import type { End, RunOutcome } from '../../../src/panel/trace/types';
import {
  at,
  busy,
  endText,
  initTracer,
  MAX_MODES,
  mode,
  MODES_KEY,
  onCode,
  onCodeChanged,
  onContext,
  runState,
  setMode,
  setTraceLayout,
  setTraceView,
  sizing,
  stale,
  stepBy,
  stepTo,
  stopTrace,
  trace,
  traceBoard,
  traced,
  traceLayout,
  tracePrev,
  traceSizes,
  traceView,
} from '../../../src/panel/tracer';
import { arr, board, vr } from '../../helpers/panel';
import { CODE, fakeDeps, result, TWO_SUM, type FakeDeps } from '../../helpers/trace';

const OTHER = { ...TWO_SUM, slug: 'add-two-numbers', inputs: ['[2,4,3]', '[5,6,4]'] };
const OTHER_CASE = { ...TWO_SUM, inputs: ['[3,2,4]', '6'] };
const B = [
  board(arr('t:nums', 'nums', ['2', '7'])),
  board(arr('t:nums', 'nums', ['2', '7']), vr('t:i', 'i', '0')),
  board(vr('t:#return', 'return', '[0, 1]')),
];
const NO_EDITOR_NOTICE = "Couldn't read your code from the editor.";

let d: FakeDeps;
// Lets promise chains settle (the code reply, storage reads and writes); no timer runs.
const tick = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const asks = () => d.sent.filter((m) => m.type === 'getCode');

// One whole Trace: click, the code arrives, the runner answers.
async function run(out: RunOutcome, lang = 'python3'): Promise<void> {
  const p = trace();
  onCode({ type: 'code', code: CODE, lang });
  await tick();
  d.runner.finish(out);
  await p;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame'] });
  d = fakeDeps();
  initTracer(d);
  await onContext(TWO_SUM);
});
afterEach(() => vi.useRealTimers());

describe('mode', () => {
  it('starts in Canvas mode with nothing traced', () => {
    expect(mode.value).toBe('canvas');
    expect(traced.value).toEqual({ t: 'none' });
    expect(traceBoard.value).toBeNull();
    expect(d.runner.starts).toBe(0);
  });

  it('starts the runner in Trace mode and remembers the problem until it is left in Canvas mode', async () => {
    vi.setSystemTime(5_000);
    setMode('trace');
    expect(mode.value).toBe('trace');
    expect(d.runner.starts).toBe(1);
    await tick();
    expect(d.kv.data.get(MODES_KEY)).toEqual({ 'two-sum': 5_000 });
    setMode('canvas');
    await tick();
    expect(d.kv.data.get(MODES_KEY)).toEqual({});
  });

  it('restores the remembered mode when a problem opens, which starts the runner', async () => {
    await d.kv.set(MODES_KEY, { 'add-two-numbers': 1 });
    await onContext(OTHER);
    expect(mode.value).toBe('trace');
    expect(d.runner.starts).toBe(1);
    await onContext(TWO_SUM);
    expect(mode.value).toBe('canvas');
  });

  it('keeps a mode the user picked while the remembered modes were still being read', async () => {
    const realGet = d.kv.get.bind(d.kv);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    d.kv.get = async (k: string) => {
      await gate;
      return realGet(k);
    };
    const p = onContext(OTHER);
    setMode('trace');
    release();
    await p;
    expect(mode.value).toBe('trace');
  });

  it('uses the remembered mode of a problem opened after the user picked one on the previous problem', async () => {
    const realGet = d.kv.get.bind(d.kv);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    d.kv.get = async (k: string) => {
      await gate;
      return realGet(k);
    };
    const p = onContext(OTHER);
    setMode('trace');
    d.kv.get = realGet;
    await onContext(TWO_SUM);
    release();
    await p;
    expect(mode.value).toBe('canvas');
  });

  it('keeps at most 100 problems, dropping the one used longest ago', async () => {
    await d.kv.set(MODES_KEY, Object.fromEntries(Array.from({ length: MAX_MODES }, (_, i) => [`p${i}`, i + 1])));
    vi.setSystemTime(10_000);
    setMode('trace');
    await tick();
    const saved = d.kv.data.get(MODES_KEY) as Record<string, number>;
    expect(Object.keys(saved)).toHaveLength(MAX_MODES);
    expect(saved['two-sum']).toBe(10_000);
    expect(saved.p0).toBeUndefined();
    expect(saved.p1).toBe(2);
  });

  // Review Focus 3
  it.each([
    ['a string', 'trace'],
    ['an array', ['two-sum']],
    ['non-number values', { 'add-two-numbers': 'yes' }],
  ] as [string, unknown][])('treats %s in lv:modes as no memory', async (_, value) => {
    await d.kv.set(MODES_KEY, value);
    await onContext(OTHER);
    expect(mode.value).toBe('canvas');
    setMode('trace');
    await tick();
    expect(d.kv.data.get(MODES_KEY)).toEqual({ 'add-two-numbers': expect.any(Number) });
  });
});

describe('trace', () => {
  beforeEach(() => setMode('trace'));

  it('asks for the code, runs it on the current test case and shows the first step', async () => {
    const r = result(B);
    const p = trace();
    expect(asks()).toEqual([{ type: 'getCode' }]);
    expect(busy.value).toBe(true);
    onCode({ type: 'code', code: CODE, lang: 'python3' });
    await tick();
    expect(d.runner.jobs).toEqual([{ code: CODE, slug: 'two-sum', meta: TWO_SUM.metaData, inputs: TWO_SUM.inputs, caps: DEFAULT_CAPS }]);
    d.runner.finish(r);
    await p;
    expect(traced.value).toEqual({ t: 'trace', result: r });
    expect([at.value, busy.value, stale.value]).toEqual([0, false, false]);
    expect(traceBoard.value).toBe(B[0]);
    expect(tracePrev.value).toBeUndefined();
    expect(Object.keys(sizing.value!.structs)).toEqual(['t:nums', 't:i', 't:#return']);
  });

  it('ignores Trace while one is in progress', async () => {
    void trace();
    await trace();
    expect(asks()).toHaveLength(1);
  });

  it.each(['python', 'python3'])('traces %s code', async (lang) => {
    await run(result(B), lang);
    expect(traced.value.t).toBe('trace');
  });

  it('does not run code in another language and says so', async () => {
    await run(result(B), 'cpp');
    expect(d.runner.jobs).toEqual([]);
    expect(traced.value).toEqual({ t: 'msg', text: 'Tracing supports Python 3. Switch the editor language to Python3.' });
  });

  it("notifies and keeps the trace when the editor can't be read", async () => {
    await run(result(B));
    const before = traced.value;
    const p = trace();
    onCode({ type: 'code', error: 'no-editor' });
    await p;
    expect(d.notices).toEqual([NO_EDITOR_NOTICE]);
    expect(traced.value).toBe(before);
    expect(d.runner.jobs).toHaveLength(1);
  });

  it('treats no answer within 2 s as no editor', async () => {
    const p = trace();
    await vi.advanceTimersByTimeAsync(1_999);
    expect(busy.value).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(d.notices).toEqual([NO_EDITOR_NOTICE]);
    expect(busy.value).toBe(false);
  });

  const none = (end: End) => result([], end);
  it.each<[string, RunOutcome, { text: string; line?: number }]>([
    ['a syntax error', none({ kind: 'syntax', msg: 'invalid syntax', line: 4, col: 9 }), { text: 'SyntaxError: invalid syntax (line 4)', line: 4 }],
    ['an unreadable input', none({ kind: 'input', param: 'nums' }), { text: 'Couldn\'t read input "nums".' }],
    ['an unsupported problem', none({ kind: 'unsupported' }), { text: "This problem's input setup isn't supported yet." }],
    [
      'an exception before any step',
      none({ kind: 'exception', type: 'AttributeError', msg: "'Solution' object has no attribute 'twoSum'", line: 0 }),
      { text: "AttributeError: 'Solution' object has no attribute 'twoSum'" },
    ],
    ['the wall timeout', { fail: 'timeout' }, { text: 'Stopped after 5 s.' }],
    ['a crash', { fail: 'fatal' }, { text: "Python crashed: recursion this deep (for example through @cache) overflows the browser's stack." }],
    ['Python failing to start', { fail: 'load' }, { text: "Couldn't start Python." }],
  ])('replaces the trace with the message for %s', async (_, out, msg) => {
    await run(result(B));
    await run(out);
    expect(traced.value).toEqual({ t: 'msg', ...msg });
    expect(traceBoard.value).toBeNull();
  });

  it('keeps the previous trace when stopped', async () => {
    await run(result(B));
    const before = traced.value;
    stepTo(2);
    const p = trace();
    onCode({ type: 'code', code: CODE, lang: 'python3' });
    await tick();
    stopTrace();
    await p;
    expect(d.runner.stops).toBe(1);
    expect(traced.value).toBe(before);
    expect(at.value).toBe(2);
    expect(busy.value).toBe(false);
  });

  it('runs nothing when stopped while the code is being read', async () => {
    const p = trace();
    stopTrace();
    await p;
    onCode({ type: 'code', code: CODE, lang: 'python3' });
    await tick();
    expect(d.runner.jobs).toEqual([]);
    expect(d.notices).toEqual([]);
    expect(busy.value).toBe(false);
  });

  it('steps within the trace and starts each new trace on its first step', async () => {
    await run(result(B));
    stepBy(1);
    expect(at.value).toBe(1);
    expect(traceBoard.value).toBe(B[1]);
    expect(tracePrev.value).toBe(B[0]);
    stepTo(99);
    expect(at.value).toBe(2);
    stepBy(1);
    expect(at.value).toBe(2);
    stepTo(-5);
    expect(at.value).toBe(0);
    stepTo(2);
    await run(result(B));
    expect(at.value).toBe(0);
  });

  it('reports the status line state from the runner and the trace', async () => {
    expect(runState.value).toBe('idle');
    d.runner.status('starting');
    expect(runState.value).toBe('starting');
    d.runner.status('ready');
    expect(runState.value).toBe('idle');
    const p = trace();
    expect(runState.value).toBe('tracing');
    d.runner.status('running');
    expect(runState.value).toBe('tracing');
    d.runner.status('restarting');
    expect(runState.value).toBe('restarting');
    stopTrace();
    await p;
    d.runner.status('ready');
    expect(runState.value).toBe('idle');
  });
});

describe('staleness', () => {
  beforeEach(() => setMode('trace'));

  it('marks a shown trace stale on a code edit, until the next trace', async () => {
    onCodeChanged();
    expect(stale.value).toBe(false); // nothing traced yet
    await run(result(B));
    vi.advanceTimersByTime(500);
    onCodeChanged();
    expect(stale.value).toBe(true);
    expect(traced.value.t).toBe('trace');
    await run(result(B));
    expect(stale.value).toBe(false);
  });

  // Review Focus 1
  it('does not mark a fresh trace stale for an edit the code it ran already had', async () => {
    await run(result(B));
    vi.advanceTimersByTime(200);
    onCodeChanged(); // typed just before Trace; the page reports it 300 ms after typing stopped
    expect(stale.value).toBe(false);
  });

  it('marks a result stale when the code changed while it ran', async () => {
    const p = trace();
    onCode({ type: 'code', code: CODE, lang: 'python3' });
    await tick();
    vi.advanceTimersByTime(400);
    onCodeChanged();
    d.runner.finish(result(B));
    await p;
    expect(stale.value).toBe(true);
  });

  it('marks the trace stale on a case switch, not on the same inputs again', async () => {
    await run(result(B));
    await onContext({ ...TWO_SUM, theme: 'dark' });
    expect(stale.value).toBe(false);
    await onContext(OTHER_CASE);
    expect(stale.value).toBe(true);
    expect(traced.value.t).toBe('trace');
  });

  it('marks a result stale when the case switched while it ran', async () => {
    const p = trace();
    onCode({ type: 'code', code: CODE, lang: 'python3' });
    await tick();
    await onContext(OTHER_CASE);
    d.runner.finish(result(B));
    await p;
    expect(stale.value).toBe(true);
  });

  // Review Focus 2
  it('clears the trace on a problem switch and drops a run still in flight', async () => {
    await run(result(B));
    const p = trace();
    onCode({ type: 'code', code: CODE, lang: 'python3' });
    await tick();
    await onContext(OTHER);
    expect(d.runner.stops).toBe(1);
    await p;
    expect(traced.value).toEqual({ t: 'none' });
    expect([at.value, stale.value, busy.value]).toEqual([0, false, false]);
    d.runner.finish(result(B)); // nothing is waiting any more
    expect(traced.value).toEqual({ t: 'none' });
  });

  it('clears a code read in progress on a problem switch without a notice', async () => {
    const p = trace();
    await onContext(OTHER);
    await p;
    expect(d.notices).toEqual([]);
    expect(busy.value).toBe(false);
  });
});

describe('trace layout memory', () => {
  it('keeps positions, reserved sizes and the view per problem, in memory only', async () => {
    setTraceLayout({ 't:nums': { x: 16, y: 16 } }, { 't:nums': { w: 120, h: 60 } });
    setTraceLayout({ 't:i': { x: 16, y: 92 } });
    setTraceView({ x: 5, y: 6, zoom: 1.5 });
    expect(traceLayout.value).toEqual({ 't:nums': { x: 16, y: 16 }, 't:i': { x: 16, y: 92 } });
    expect(traceSizes.value).toEqual({ 't:nums': { w: 120, h: 60 } });
    await onContext(OTHER);
    expect([traceLayout.value, traceSizes.value, traceView.value]).toEqual([{}, {}, { x: 0, y: 0, zoom: 1 }]);
    await onContext(TWO_SUM);
    expect(traceView.value).toEqual({ x: 5, y: 6, zoom: 1.5 });
    expect(traceLayout.value['t:i']).toEqual({ x: 16, y: 92 });
    expect(d.kv.data.size).toBe(0);
  });

  it('leaves the signals alone when nothing changes', () => {
    setTraceLayout({ 't:nums': { x: 16, y: 16 } }, { 't:nums': { w: 1, h: 1 } });
    setTraceView({ x: 1, y: 1, zoom: 1 });
    const before = [traceLayout.value, traceSizes.value, traceView.value];
    setTraceLayout({ 't:nums': { x: 16, y: 16 } }, { 't:nums': { w: 1, h: 1 } });
    setTraceView({ x: 1, y: 1, zoom: 1 });
    expect([traceLayout.value, traceSizes.value, traceView.value]).toEqual(before);
    expect(traceLayout.value).toBe(before[0]);
    expect(traceView.value).toBe(before[2]);
  });
});

describe('endText', () => {
  it.each<[End, string]>([
    [{ kind: 'return', value: '[0, 1]' }, 'Returned [0, 1]'],
    [{ kind: 'return' }, 'Finished'],
    [{ kind: 'exception', type: 'ValueError', msg: 'list index out of range', line: 7 }, 'ValueError: list index out of range (line 7)'],
    [{ kind: 'exception', type: 'StopIteration', msg: '', line: 3 }, 'StopIteration (line 3)'],
    [{ kind: 'exception', type: 'KeyError', msg: "'a'", line: 0 }, "KeyError: 'a'"],
    [{ kind: 'cap', cap: 'steps' }, 'Stopped after 10,000 steps'],
    [{ kind: 'cap', cap: 'time' }, 'Stopped after 3 s'],
    [{ kind: 'cap', cap: 'size' }, 'Stopped at 5 MB of trace'],
    [{ kind: 'syntax', msg: 'invalid syntax', line: 4, col: 2 }, 'SyntaxError: invalid syntax (line 4)'],
    [{ kind: 'input', param: 'nums' }, 'Couldn\'t read input "nums".'],
    [{ kind: 'unsupported' }, "This problem's input setup isn't supported yet."],
  ])('reads %o as %s', (end, text) => {
    expect(endText(end)).toBe(text);
  });
});
