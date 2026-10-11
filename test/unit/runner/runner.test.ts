import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToWorker } from '../../../src/panel/runner/protocol';
import { createRunner, LOAD_MS, MAX_HEAP, RUN_MS, type Runner, type RunnerStatus, type WorkerLike } from '../../../src/panel/runner/runner';
import { DEFAULT_CAPS, type Job } from '../../../src/panel/trace/raw';
import type { RunOutcome, TraceResult } from '../../../src/panel/trace/types';

const BASE = 'chrome-extension://abc/pyodide/';

type RunMsg = Extract<ToWorker, { type: 'run' }>;

class FakeWorker {
  posted: ToWorker[] = [];
  terminated = false;
  private on: Record<'message' | 'error', ((e: any) => void)[]> = { message: [], error: [] };
  postMessage(m: ToWorker) {
    this.posted.push(m);
  }
  terminate() {
    this.terminated = true;
  }
  addEventListener(type: 'message' | 'error', cb: (e: any) => void) {
    this.on[type].push(cb);
  }
  reply(data: unknown) {
    this.on.message.forEach((cb) => cb({ data }));
  }
  crash(): Event {
    const e = new Event('error', { cancelable: true });
    this.on.error.forEach((cb) => cb(e));
    return e;
  }
  runs(): RunMsg[] {
    return this.posted.filter((m): m is RunMsg => m.type === 'run');
  }
}

const job = (code: string): Job => ({ code, slug: 'two-sum', meta: null, inputs: [], caps: DEFAULT_CAPS });
const result = (code: string): TraceResult => ({ steps: [], end: { kind: 'return' }, truncated: false, code });
const done = (id: number, code: string, heap = 1_000) => ({ type: 'done', id, result: result(code), heap });

let workers: FakeWorker[];
let statuses: RunnerStatus[];
const w = (i: number) => workers[i];

function runner(): Runner {
  const r = createRunner({
    base: BASE,
    createWorker: () => {
      const fake = new FakeWorker();
      workers.push(fake);
      return fake as unknown as WorkerLike;
    },
  });
  r.onStatus((s) => statuses.push(s));
  return r;
}

// The outcome once it has settled, without awaiting a promise that may never settle.
function track(p: Promise<RunOutcome>): { v?: RunOutcome } {
  const t: { v?: RunOutcome } = {};
  void p.then((v) => (t.v = v));
  return t;
}
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  workers = [];
  statuses = [];
});

afterEach(() => vi.useRealTimers());

describe('createRunner', () => {
  it('starts no worker until asked, then exactly one, reporting starting and ready', () => {
    const r = runner();
    expect(workers).toHaveLength(0);
    r.start();
    r.start();
    expect(workers).toHaveLength(1);
    expect(w(0).posted).toEqual([{ type: 'init', base: BASE }]);
    expect(statuses).toEqual(['starting']);
    w(0).reply({ type: 'ready', snapshot: true });
    expect(statuses).toEqual(['starting', 'ready']);
  });

  it('queues a run made while Python starts and posts it once ready', async () => {
    const r = runner();
    const t = track(r.run(job('a')));
    expect(workers).toHaveLength(1);
    expect(w(0).runs()).toEqual([]);
    w(0).reply({ type: 'ready', snapshot: false });
    expect(w(0).runs()).toEqual([{ type: 'run', id: 1, job: job('a') }]);
    expect(statuses).toEqual(['starting', 'ready', 'running']);
    w(0).reply(done(1, 'a'));
    await flush();
    expect(t.v).toEqual(result('a'));
    expect(statuses.at(-1)).toBe('ready');
  });

  it('posts one run at a time, in order', async () => {
    const r = runner();
    r.start();
    w(0).reply({ type: 'ready', snapshot: true });
    const a = track(r.run(job('a')));
    const b = track(r.run(job('b')));
    expect(w(0).runs().map((m) => m.id)).toEqual([1]);
    w(0).reply(done(1, 'a'));
    expect(w(0).runs().map((m) => m.id)).toEqual([1, 2]);
    w(0).reply(done(2, 'b'));
    await flush();
    expect([a.v, b.v]).toEqual([result('a'), result('b')]);
  });

  // Review Focus 4
  it('resolves queued runs as stopped on Stop without restarting a worker that is still starting', async () => {
    const r = runner();
    const t = track(r.run(job('a')));
    r.stop();
    await flush();
    expect(t.v).toEqual({ fail: 'stopped' });
    expect(w(0).terminated).toBe(false);
    expect(workers).toHaveLength(1);
    w(0).reply({ type: 'ready', snapshot: true });
    expect(w(0).runs()).toEqual([]);
  });

  it('terminates and restarts on Stop during a run', async () => {
    const r = runner();
    r.start();
    w(0).reply({ type: 'ready', snapshot: true });
    const t = track(r.run(job('a')));
    r.stop();
    await flush();
    expect(t.v).toEqual({ fail: 'stopped' });
    expect(w(0).terminated).toBe(true);
    expect(w(1).posted).toEqual([{ type: 'init', base: BASE }]);
    expect(statuses).toEqual(['starting', 'ready', 'running', 'restarting']);
    w(1).reply({ type: 'ready', snapshot: true });
    expect(statuses.at(-1)).toBe('ready');
  });

  it('survives a status listener that stops the run it was just told about', async () => {
    const r = runner();
    r.onStatus((s) => s === 'running' && r.stop());
    r.start();
    w(0).reply({ type: 'ready', snapshot: true });
    const t = track(r.run(job('a')));
    await flush();
    expect(t.v).toEqual({ fail: 'stopped' });
    expect(w(1).runs()).toEqual([]);
    await vi.advanceTimersByTimeAsync(RUN_MS);
    expect(workers).toHaveLength(2);
    expect(t.v).toEqual({ fail: 'stopped' });
  });

  it('times a run out after 5 s, terminates the worker and starts a fresh one', async () => {
    const r = runner();
    r.start();
    w(0).reply({ type: 'ready', snapshot: true });
    const t = track(r.run(job('while True: pass')));
    await vi.advanceTimersByTimeAsync(RUN_MS - 1);
    expect(t.v).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(t.v).toEqual({ fail: 'timeout' });
    expect(w(0).terminated).toBe(true);
    expect(w(1).posted).toEqual([{ type: 'init', base: BASE }]);
    expect(statuses.at(-1)).toBe('restarting');
  });

  // Review Focus 3
  it('ignores a done from a replaced worker or for another run', async () => {
    const r = runner();
    r.start();
    w(0).reply({ type: 'ready', snapshot: true });
    void r.run(job('a'));
    await vi.advanceTimersByTimeAsync(RUN_MS);
    w(1).reply({ type: 'ready', snapshot: true });
    const t = track(r.run(job('b')));
    w(0).reply(done(2, 'from the replaced worker'));
    w(1).reply(done(1, 'for the timed-out run'));
    await flush();
    expect(t.v).toBeUndefined();
    w(1).reply(done(2, 'b'));
    await flush();
    expect(t.v).toEqual(result('b'));
  });

  it('reports fatal and restarts on a fatal message or a worker error during a run', async () => {
    const r = runner();
    r.start();
    w(0).reply({ type: 'ready', snapshot: true });
    const a = track(r.run(job('a')));
    w(0).reply({ type: 'fatal', msg: 'Maximum call stack size exceeded' });
    await flush();
    expect(a.v).toEqual({ fail: 'fatal' });
    expect(w(0).terminated).toBe(true);
    w(1).reply({ type: 'ready', snapshot: true });
    const b = track(r.run(job('b')));
    expect(w(1).crash().defaultPrevented).toBe(true);
    await flush();
    expect(b.v).toEqual({ fail: 'fatal' });
    expect(w(1).terminated).toBe(true);
    expect(workers).toHaveLength(3);
  });

  it('fails queued runs with load after 15 s without ready, and tries again on the next run', async () => {
    const r = runner();
    const t = track(r.run(job('a')));
    await vi.advanceTimersByTimeAsync(LOAD_MS - 1);
    expect(t.v).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(t.v).toEqual({ fail: 'load' });
    expect(w(0).terminated).toBe(true);
    expect(statuses).toEqual(['starting', 'off']);
    void r.run(job('b'));
    expect(workers).toHaveLength(2);
    expect(statuses.at(-1)).toBe('starting');
  });

  it('fails with load at once when the worker errors or reports fatal before ready', async () => {
    const r = runner();
    const a = track(r.run(job('a')));
    w(0).crash();
    await flush();
    expect(a.v).toEqual({ fail: 'load' });
    const b = track(r.run(job('b')));
    w(1).reply({ type: 'fatal', msg: 'pyodide.asm.wasm: 404' });
    await flush();
    expect(b.v).toEqual({ fail: 'load' });
    expect(statuses.at(-1)).toBe('off');
  });

  it('recycles the worker after a run that leaves more than 256 MB of heap', async () => {
    const r = runner();
    r.start();
    w(0).reply({ type: 'ready', snapshot: true });
    const a = track(r.run(job('a')));
    w(0).reply(done(1, 'a', MAX_HEAP));
    await flush();
    expect(a.v).toEqual(result('a'));
    expect(w(0).terminated).toBe(false);
    const b = track(r.run(job('b')));
    w(0).reply(done(2, 'b', MAX_HEAP + 1));
    await flush();
    expect(b.v).toEqual(result('b'));
    expect(w(0).terminated).toBe(true);
    expect(w(1).posted).toEqual([{ type: 'init', base: BASE }]);
    expect(statuses.slice(-2)).toEqual(['running', 'restarting']);
  });

  it('ignores malformed worker messages', async () => {
    const r = runner();
    const t = track(r.run(job('a')));
    for (const bad of [null, 'ready', { type: 'ready' }, { type: 'done', id: 1 }, { type: 'fatal' }, { type: 'nope' }]) w(0).reply(bad);
    await flush();
    expect(statuses).toEqual(['starting']);
    expect(t.v).toBeUndefined();
  });

  it('stops reporting status to a listener after it unsubscribes', () => {
    const r = runner();
    const seen: RunnerStatus[] = [];
    const off = r.onStatus((s) => seen.push(s));
    r.start();
    off();
    w(0).reply({ type: 'ready', snapshot: true });
    expect(seen).toEqual(['starting']);
    expect(statuses).toEqual(['starting', 'ready']);
  });
});
