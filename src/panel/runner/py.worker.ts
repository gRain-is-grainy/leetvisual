import { createHost } from './host';
import type { ToWorker } from './protocol';

// Every harness module, bundled as text; install() writes them into Pyodide's file system.
const sources = import.meta.glob<string>('./py/*.py', { query: '?raw', import: 'default', eager: true });
const files = Object.fromEntries(Object.entries(sources).map(([path, src]) => [path.slice(path.lastIndexOf('/') + 1), src]));

const host = createHost({
  // Not bundled: Pyodide's files ship unmodified in dist/pyodide/ (MPL-2.0), so its loader is imported from there.
  importPyodide: (url) => import(/* @vite-ignore */ url),
  fetch: (url) => fetch(url),
  post: (m) => self.postMessage(m),
  files,
});

self.addEventListener('message', (e: MessageEvent<ToWorker>) => void host.onMessage(e.data));
