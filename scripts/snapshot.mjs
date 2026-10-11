// Post-build step (spec §10): copies Pyodide's runtime and the vendored wheel into dist/pyodide/ unmodified, then
// builds snapshot.bin, the memory image a worker restores instead of loading Python from scratch.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPyodide } from 'pyodide';

const SRC = 'node_modules/pyodide';
const OUT = 'dist/pyodide';
const PY = 'src/panel/runner/py';
const WHEEL = 'sortedcontainers-2.4.0-py2.py3-none-any.whl';
const FILES = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];
// Pyodide's default wasm memory, 480 pages. Restoring a snapshot whose heap is bigger fails (pyodide#6254).
const MAX_HEAP = 480 * 65536;

mkdirSync(OUT, { recursive: true });
for (const f of FILES) copyFileSync(join(SRC, f), join(OUT, f));

const wheel = readFileSync(join('vendor', WHEEL));
const want = JSON.parse(readFileSync(join(SRC, 'pyodide-lock.json'), 'utf8')).packages.sortedcontainers.sha256;
const got = createHash('sha256').update(wheel).digest('hex');
if (got !== want) throw new Error(`vendor/${WHEEL} has sha256 ${got}; pyodide-lock.json expects ${want}`);
copyFileSync(join('vendor', WHEEL), join(OUT, WHEEL));

const quiet = () => {};
const py = await loadPyodide({ _makeSnapshot: true, stdout: quiet, stderr: quiet });
// The same steps as install.ts on the worker's plain-load path, so a restored worker matches a plainly loaded one.
py.FS.mkdirTree('/lv');
py.unpackArchive(new Uint8Array(wheel), 'wheel', { extractDir: '/lv' }); // a Node Buffer is rejected
for (const f of readdirSync(PY).filter((name) => name.endsWith('.py'))) {
  py.FS.writeFile(`/lv/${f}`, readFileSync(join(PY, f), 'utf8'));
}
// One tiny trace imports every prelude module, so the snapshot already holds them.
const job = {
  code: 'class Solution:\n    def f(self, x: int) -> int:\n        return x\n',
  slug: 'snapshot',
  meta: { name: 'f', params: [{ name: 'x', type: 'integer' }], return: { type: 'integer' } },
  inputs: ['1'],
  caps: { steps: 100, ms: 1000, bytes: 100000 },
};
py.runPython(`import sys
sys.path.insert(0, '/lv')
import lv_harness
_ = lv_harness.run(${JSON.stringify(JSON.stringify(job))})
del _`);

const snapshot = py.makeMemorySnapshot();
// The header is little-endian uint32s [magic, header length, ...]; the wasm heap follows it.
// The heap is exactly 480 pages because the warm-up does not grow wasm memory, so any growth fails the build here.
// Fallback: drop the warm-up `run` and keep `import lv_harness`.
const heap = snapshot.length - new Uint32Array(snapshot.buffer, snapshot.byteOffset, 2)[1];
if (heap > MAX_HEAP) throw new Error(`snapshot heap is ${heap} bytes, over Pyodide's default ${MAX_HEAP}; restoring it would fail`);
writeFileSync(join(OUT, 'snapshot.bin'), snapshot);
console.log(`${OUT}/snapshot.bin: ${snapshot.length} bytes, heap ${heap} of ${MAX_HEAP}`);
