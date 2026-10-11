import type { Board } from '../../src/panel/model/types';
import type { Runner, RunnerStatus } from '../../src/panel/runner/runner';
import type { KV } from '../../src/panel/store/kv';
import type { Job } from '../../src/panel/trace/raw';
import type { End, RunOutcome, TraceResult } from '../../src/panel/trace/types';
import type { TracerDeps } from '../../src/panel/tracer';
import type { ContextMsg, ToContent } from '../../src/shared/messages';
import { memoryKV } from './memory-kv';

export const TWO_SUM: ContextMsg = {
  type: 'context',
  slug: 'two-sum',
  metaData: { name: 'twoSum', params: [{ name: 'nums', type: 'integer[]' }, { name: 'target', type: 'integer' }] },
  inputs: ['[2,7,11,15]', '9'],
  theme: 'light',
};

export const CODE = 'class Solution:\n    def twoSum(self, nums, target):\n        seen = {}\n        return [0, 1]\n';

export type FakeRunner = Runner & {
  jobs: Job[];
  starts: number;
  stops: number;
  finish(o: RunOutcome): void; // resolves the oldest run still waiting
  status(s: RunnerStatus): void; // reports a status to every onStatus listener
};

export function fakeRunner(): FakeRunner {
  const waiting: ((o: RunOutcome) => void)[] = [];
  const listeners = new Set<(s: RunnerStatus) => void>();
  const r: FakeRunner = {
    jobs: [],
    starts: 0,
    stops: 0,
    start() {
      r.starts++;
    },
    run(job) {
      r.jobs.push(job);
      return new Promise((resolve) => waiting.push(resolve));
    },
    stop() {
      r.stops++;
      for (const resolve of waiting.splice(0)) resolve({ fail: 'stopped' });
    },
    onStatus(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    finish(o) {
      waiting.shift()?.(o);
    },
    status(s) {
      for (const cb of listeners) cb(s);
    },
  };
  return r;
}

export type FakeDeps = TracerDeps & {
  runner: FakeRunner;
  kv: KV & { data: Map<string, unknown> };
  sent: ToContent[];
  notices: string[];
};

export function fakeDeps(): FakeDeps {
  const sent: ToContent[] = [];
  const notices: string[] = [];
  return {
    runner: fakeRunner(),
    kv: memoryKV(),
    sent,
    notices,
    send: (m) => void sent.push(m),
    notify: (text) => void notices.push(text),
  };
}

// One step per board, on lines 2, 3, 4, … of CODE: a call, then line steps.
export function result(boards: Board[], end: End = { kind: 'return', value: '[0, 1]' }, extra: Partial<TraceResult> = {}): TraceResult {
  return {
    steps: boards.map((board, i) => ({ board, line: i + 2, ev: i === 0 ? ('call' as const) : ('line' as const), depth: 1, fn: 'twoSum' })),
    end,
    truncated: false,
    code: CODE,
    ...extra,
  };
}
