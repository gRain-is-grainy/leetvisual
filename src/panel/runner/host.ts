import type { PyodideAPI } from 'pyodide';
import type { RTrace } from '../trace/raw';
import { buildSteps } from '../trace/steps';
import { install, WHEEL } from './install';
import type { FromWorker, ToWorker } from './protocol';

export type HostDeps = {
  importPyodide(url: string): Promise<{ loadPyodide(opts: object): Promise<PyodideAPI> }>;
  fetch(url: string): Promise<Response>;
  post(m: FromWorker): void;
  files: Record<string, string>;
};

type Harness = { run(jobJson: string): string };
// HEAPU8 lives on Pyodide's Emscripten module, which its typings leave out.
type WithHeap = { _module: { HEAPU8: Uint8Array } };

const quiet = () => {}; // print() and SyntaxWarnings must not reach the console

// The worker's logic, behind injected deps so it runs in unit tests. py.worker.ts wires it to the worker global.
export function createHost(deps: HostDeps): { onMessage(m: ToWorker): Promise<void> } {
  let py: PyodideAPI | null = null;
  let harness: Harness | null = null;

  async function bytes(url: string): Promise<Uint8Array> {
    const res = await deps.fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  // Spec §8: restore the build-time snapshot; if it is missing or restoring throws, load plainly, without a message.
  async function load(base: string): Promise<boolean> {
    const { loadPyodide } = await deps.importPyodide(`${base}pyodide.mjs`);
    const opts = { indexURL: base, packageBaseUrl: base, stdout: quiet, stderr: quiet };
    try {
      py = await loadPyodide({ ...opts, _loadSnapshot: await bytes(`${base}snapshot.bin`) });
      install(py, deps.files);
      return true;
    } catch {
      py = await loadPyodide(opts);
      install(py, deps.files, await bytes(`${base}${WHEEL}`));
      return false;
    }
  }

  return {
    async onMessage(m) {
      try {
        if (m.type === 'init') {
          const snapshot = await load(m.base);
          harness = py!.pyimport('lv_harness') as Harness;
          deps.post({ type: 'ready', snapshot });
          return;
        }
        const raw = JSON.parse(harness!.run(JSON.stringify(m.job))) as RTrace;
        const heap = (py as unknown as WithHeap)._module.HEAPU8.length;
        deps.post({ type: 'done', id: m.id, result: buildSteps(raw, m.job.code), heap });
      } catch (e) {
        // A Python exception never escapes lv_harness.run, so anything here is Pyodide itself failing.
        deps.post({ type: 'fatal', msg: e instanceof Error ? e.message : String(e) });
      }
    },
  };
}
