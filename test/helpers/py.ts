import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPyodide, type PyodideAPI } from 'pyodide';
import { install, WHEEL } from '../../src/panel/runner/install';

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
