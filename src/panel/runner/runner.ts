import type { Job } from '../trace/raw';
import type { RunOutcome } from '../trace/types';
import { isFromWorker, type ToWorker } from './protocol';

export const LOAD_MS = 15_000;
export const RUN_MS = 5_000;
export const MAX_HEAP = 268_435_456;

export type RunnerStatus = 'off' | 'starting' | 'ready' | 'running' | 'restarting';
export type WorkerLike = {
  postMessage(m: ToWorker): void;
  terminate(): void;
  addEventListener(type: 'message', cb: (e: MessageEvent) => void): void;
  addEventListener(type: 'error', cb: (e: Event) => void): void;
};
export type Runner = {
  start(): void;
  run(job: Job): Promise<RunOutcome>;
  stop(): void;
  onStatus(cb: (s: RunnerStatus) => void): () => void;
};

type Run = { id: number; job: Job; resolve(o: RunOutcome): void };

export function createRunner(opts: { base: string; createWorker?: () => WorkerLike }): Runner {
  const make =
    opts.createWorker ??
    (() => new Worker(new URL('./py.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike);
  const listeners = new Set<(s: RunnerStatus) => void>();
  const queue: Run[] = [];
  let worker: WorkerLike | null = null;
  let ready = false;
  let current: Run | null = null;
  let status: RunnerStatus = 'off';
  let nextId = 1;
  let loadTimer: ReturnType<typeof setTimeout> | undefined;
  let runTimer: ReturnType<typeof setTimeout> | undefined;

  function setStatus(s: RunnerStatus) {
    if (s === status) return;
    status = s;
    listeners.forEach((cb) => cb(s));
  }

  function spawn(again: boolean) {
    const w = make();
    worker = w;
    ready = false;
    setStatus(again ? 'restarting' : 'starting');
    // Anything a replaced worker still sends is ignored.
    w.addEventListener('message', (e) => {
      if (worker === w) onMessage(e.data);
    });
    w.addEventListener('error', () => {
      if (worker === w) onCrash();
    });
    w.postMessage({ type: 'init', base: opts.base });
    loadTimer = setTimeout(loadFailed, LOAD_MS); // loadPyodide hangs instead of throwing when wasm is blocked
  }

  function kill() {
    clearTimeout(loadTimer);
    clearTimeout(runTimer);
    worker?.terminate();
    worker = null;
    ready = false;
  }

  function restart() {
    kill();
    spawn(true);
  }

  function loadFailed() {
    kill();
    setStatus('off');
    for (const r of queue.splice(0)) r.resolve({ fail: 'load' });
  }

  function finish(o: RunOutcome) {
    clearTimeout(runTimer);
    const r = current!;
    current = null;
    r.resolve(o);
  }

  function pump() {
    if (!worker || !ready || current || !queue.length) return;
    const r = (current = queue.shift()!);
    setStatus('running');
    worker.postMessage({ type: 'run', id: r.id, job: r.job });
    runTimer = setTimeout(() => {
      finish({ fail: 'timeout' }); // a long C call with no line events never reaches the step or time caps
      restart();
    }, RUN_MS);
  }

  function onCrash() {
    if (!ready) return loadFailed();
    if (current) finish({ fail: 'fatal' });
    restart();
  }

  function onMessage(data: unknown) {
    if (!isFromWorker(data)) return;
    if (data.type === 'fatal') return onCrash();
    if (data.type === 'ready') {
      if (ready) return;
      ready = true;
      clearTimeout(loadTimer);
      setStatus('ready');
      return pump();
    }
    if (!current || data.id !== current.id) return;
    finish(data.result);
    // The wasm heap never shrinks; only a fresh worker gives it back.
    if (data.heap > MAX_HEAP) return restart();
    setStatus('ready');
    pump();
  }

  return {
    start() {
      if (!worker) spawn(false);
    },
    run(job) {
      return new Promise<RunOutcome>((resolve) => {
        queue.push({ id: nextId++, job, resolve });
        if (!worker) spawn(false);
        else pump();
      });
    },
    stop() {
      for (const r of queue.splice(0)) r.resolve({ fail: 'stopped' });
      if (!current) return; // a worker that is only starting keeps starting
      finish({ fail: 'stopped' });
      restart();
    },
    onStatus(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
  };
}
