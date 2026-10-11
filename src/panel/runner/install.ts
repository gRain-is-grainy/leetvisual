import type { PyodideAPI } from 'pyodide';

export const PY_HOME = '/lv';
export const WHEEL = 'sortedcontainers-2.4.0-py2.py3-none-any.whl';

// The harness modules import each other by name, so they live flat in one directory at the front of sys.path.
// A snapshot restore already has them imported; the plain load also unpacks the wheel there.
export function install(py: PyodideAPI, files: Record<string, string>, wheel?: Uint8Array): void {
  py.FS.mkdirTree(PY_HOME);
  for (const [name, src] of Object.entries(files)) py.FS.writeFile(`${PY_HOME}/${name}`, src);
  // unpackArchive rejects a Node Buffer ("Unknown typed array type 'Buffer'"), so callers pass a plain Uint8Array.
  if (wheel) py.unpackArchive(wheel, 'wheel', { extractDir: PY_HOME });
  py.runPython(`import sys\nif ${JSON.stringify(PY_HOME)} not in sys.path:\n    sys.path.insert(0, ${JSON.stringify(PY_HOME)})\nimport lv_harness`);
}
