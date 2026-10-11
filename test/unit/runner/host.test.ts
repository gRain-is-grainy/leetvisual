import type { PyodideAPI } from 'pyodide';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHost } from '../../../src/panel/runner/host';
import { install } from '../../../src/panel/runner/install';
import type { FromWorker } from '../../../src/panel/runner/protocol';
import { DEFAULT_CAPS, type Job, type RTrace } from '../../../src/panel/trace/raw';
import { buildSteps } from '../../../src/panel/trace/steps';

vi.mock('../../../src/panel/runner/install', () => ({
  install: vi.fn(),
  PY_HOME: '/lv',
  WHEEL: 'sortedcontainers-2.4.0-py2.py3-none-any.whl',
}));
vi.mock('../../../src/panel/trace/steps', () => ({
  buildSteps: vi.fn((raw: { end: unknown; truncated: boolean }, code: string) => ({ steps: [], end: raw.end, truncated: raw.truncated, code })),
}));

const BASE = 'chrome-extension://abc/pyodide/';
const FILES = { 'lv_harness.py': 'def run(job):\n    return job\n' };
const RAW: RTrace = {
  v: 1,
  keyEvery: 1000,
  facts: {},
  entry: { lists: [], trees: [], args: [] },
  steps: [],
  end: { kind: 'return', value: '3' },
  outputs: null,
  truncated: false,
};
const JOB: Job = { code: 'class Solution:\n    pass\n', slug: 'two-sum', meta: null, inputs: ['[2,7]', '9'], caps: DEFAULT_CAPS };

const res = (bytes: number[], status = 200) =>
  ({ ok: status === 200, status, arrayBuffer: async () => new Uint8Array(bytes).buffer }) as unknown as Response;

type Setup = { snapshot?: 'missing' | 'offline'; restore?: 'throws'; plain?: 'throws' };

function setup(s: Setup = {}) {
  const posted: FromWorker[] = [];
  const run = vi.fn((_json: string) => JSON.stringify(RAW));
  const pyimport = vi.fn((_name: string) => ({ run }));
  const py = { pyimport, _module: { HEAPU8: { length: 31_457_280 } } } as unknown as PyodideAPI;
  const loadPyodide = vi.fn(async (opts: { _loadSnapshot?: Uint8Array }) => {
    if (opts._loadSnapshot && s.restore === 'throws') throw new Error('Snapshot build id mismatch');
    if (!opts._loadSnapshot && s.plain === 'throws') throw new Error('pyodide.asm.wasm: 404');
    return py;
  });
  const importPyodide = vi.fn(async (_url: string) => ({ loadPyodide }));
  const fetch = vi.fn(async (url: string) => {
    if (!url.endsWith('snapshot.bin')) return res([7, 7]);
    if (s.snapshot === 'offline') throw new TypeError('Failed to fetch');
    return s.snapshot === 'missing' ? res([], 404) : res([1, 2, 3]);
  });
  const host = createHost({ importPyodide, fetch, post: (m) => void posted.push(m), files: FILES });
  return { host, posted, py, pyimport, run, loadPyodide, importPyodide, fetch };
}

beforeEach(() => vi.clearAllMocks());

describe('init', () => {
  it('restores the build-time snapshot and reports snapshot: true', async () => {
    const t = setup();
    await t.host.onMessage({ type: 'init', base: BASE });
    expect(t.importPyodide).toHaveBeenCalledWith(`${BASE}pyodide.mjs`);
    expect(t.loadPyodide).toHaveBeenCalledTimes(1);
    const opts = t.loadPyodide.mock.calls[0][0] as Record<string, unknown>;
    expect(opts).toMatchObject({ indexURL: BASE, packageBaseUrl: BASE, _loadSnapshot: new Uint8Array([1, 2, 3]) });
    expect(typeof opts.stdout).toBe('function');
    expect(typeof opts.stderr).toBe('function');
    expect(install).toHaveBeenCalledWith(t.py, FILES);
    expect(t.fetch).toHaveBeenCalledTimes(1);
    expect(t.posted).toEqual([{ type: 'ready', snapshot: true }]);
  });

  it('loads plainly, with the wheel, when the snapshot is missing or unreachable', async () => {
    for (const snapshot of ['missing', 'offline'] as const) {
      vi.clearAllMocks();
      const t = setup({ snapshot });
      await t.host.onMessage({ type: 'init', base: BASE });
      expect(t.loadPyodide).toHaveBeenCalledTimes(1);
      expect(t.loadPyodide.mock.calls[0][0]).not.toHaveProperty('_loadSnapshot');
      expect(t.fetch).toHaveBeenCalledWith(`${BASE}sortedcontainers-2.4.0-py2.py3-none-any.whl`);
      expect(install).toHaveBeenCalledWith(t.py, FILES, new Uint8Array([7, 7]));
      expect(t.posted).toEqual([{ type: 'ready', snapshot: false }]);
    }
  });

  // Review Focus 5
  it('falls back to a plain load without a message when restoring the snapshot throws', async () => {
    const t = setup({ restore: 'throws' });
    await t.host.onMessage({ type: 'init', base: BASE });
    expect(t.loadPyodide).toHaveBeenCalledTimes(2);
    expect(t.loadPyodide.mock.calls[1][0]).not.toHaveProperty('_loadSnapshot');
    expect(t.posted).toEqual([{ type: 'ready', snapshot: false }]);
  });

  it('reports fatal, and no ready, when even the plain load fails', async () => {
    const t = setup({ snapshot: 'missing', plain: 'throws' });
    await t.host.onMessage({ type: 'init', base: BASE });
    expect(t.posted).toEqual([{ type: 'fatal', msg: 'pyodide.asm.wasm: 404' }]);
  });
});

describe('run', () => {
  it('runs the harness on the job and posts the built steps with the heap size', async () => {
    const t = setup();
    await t.host.onMessage({ type: 'init', base: BASE });
    await t.host.onMessage({ type: 'run', id: 7, job: JOB });
    expect(t.pyimport).toHaveBeenCalledWith('lv_harness');
    expect(t.run).toHaveBeenCalledWith(JSON.stringify(JOB));
    expect(buildSteps).toHaveBeenCalledWith(RAW, JOB.code);
    expect(t.posted.at(-1)).toEqual({
      type: 'done',
      id: 7,
      result: { steps: [], end: RAW.end, truncated: false, code: JOB.code },
      heap: 31_457_280,
    });
  });

  it('reports fatal when the harness or the step building throws', async () => {
    const t = setup();
    await t.host.onMessage({ type: 'init', base: BASE });
    t.run.mockImplementationOnce(() => {
      throw new Error('RangeError: Maximum call stack size exceeded');
    });
    await t.host.onMessage({ type: 'run', id: 1, job: JOB });
    expect(t.posted.at(-1)).toEqual({ type: 'fatal', msg: 'RangeError: Maximum call stack size exceeded' });
    vi.mocked(buildSteps).mockImplementationOnce(() => {
      throw new Error('bad trace');
    });
    await t.host.onMessage({ type: 'run', id: 2, job: JOB });
    expect(t.posted.at(-1)).toEqual({ type: 'fatal', msg: 'bad trace' });
  });
});
