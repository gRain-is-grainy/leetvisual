import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPyodide, type PyodideAPI } from 'pyodide';
import { install, WHEEL } from '../../src/panel/runner/install';
import { DEFAULT_CAPS, type Caps, type RObj, type RStep, type RVal } from '../../src/panel/trace/raw';

const PY_DIR = 'src/panel/runner/py';

// One Pyodide per test file: loading takes about 1.5 s.
export async function loadHarness(): Promise<PyodideAPI> {
  const py = await loadPyodide({ stdout: () => {}, stderr: () => {} });
  const files = Object.fromEntries(
    readdirSync(PY_DIR)
      .filter((f) => f.endsWith('.py'))
      .map((f) => [f, readFileSync(join(PY_DIR, f), 'utf8')]),
  );
  install(py, files, new Uint8Array(readFileSync(join('vendor', WHEEL))));
  return py;
}

// Runs Python whose last line is an expression evaluating to a JSON string, and parses it.
export function pyJson<T = unknown>(py: PyodideAPI, src: string): T {
  return JSON.parse(py.runPython(src) as string) as T;
}

export type Traced = { steps: RStep[]; end: string; line: number | null; truncated: boolean };

// Traces `call` (a Python expression, e.g. "Solution().f(3)") after running `code` as the user's module,
// straight through lv_trace.Recorder. `end` is 'return', 'cap:<cap>' or the exception's type name.
export function traceSteps(py: PyodideAPI, code: string, call: string, caps: Partial<Caps> = {}): Traced {
  py.globals.set('LV_SRC', code);
  py.globals.set('LV_CALL', call);
  py.globals.set('LV_CAPS', JSON.stringify({ ...DEFAULT_CAPS, ...caps }));
  return pyJson<Traced>(
    py,
    `
import json, lv_harness, lv_nodes, lv_trace
g = lv_harness.fresh_globals()
exec(compile(LV_SRC, lv_trace.FILE, 'exec'), g)
rec = lv_trace.Recorder(json.loads(LV_CAPS))
line = None
try:
    rec.run(lambda: eval(LV_CALL, g))
    end = 'return'
except lv_trace.CapStop as c:
    end = 'cap:' + c.cap
except BaseException as e:
    end = type(e).__name__
    line = rec.raise_line(e)
lv_nodes.unlink_all()
json.dumps({'steps': [json.loads(p) for p in rec.parts], 'end': end, 'line': line, 'truncated': rec.truncated})
`,
  );
}

// A heap rebuilt from steps[0..k]: keyframes replace it, dh entries update it.
export function heapAt(steps: RStep[], k = steps.length - 1): Record<string, RObj> {
  let heap: Record<string, RObj> = {};
  for (const s of steps.slice(0, k + 1)) {
    if (s.heap) heap = { ...s.heap };
    if (s.dh) Object.assign(heap, s.dh);
  }
  return heap;
}

export const entryOf = (heap: Record<string, RObj>, v: RVal | undefined): RObj | undefined =>
  Array.isArray(v) ? heap[v[1]] : undefined;
