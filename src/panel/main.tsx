import { render } from 'preact';
import { App } from './app';
import { listen, send } from './bridge/bridge';
import { flushSaves, initState, openContext, setTheme } from './state';
import { onKey } from './keys';
import { createRunner } from './runner/runner';
import { chromeKV } from './store/kv';
import './styles.css';

initState(chromeKV(chrome.storage.local));
setTheme(location.hash === '#dark' ? 'dark' : 'light');
listen((msg) => {
  if (msg.type === 'context') void openContext(msg);
  else if (msg.type === 'theme') setTheme(msg.theme);
});
window.addEventListener('pagehide', () => void flushSaves());
window.addEventListener('keydown', onKey);
// Trace mode runs code through this. Creating it starts no worker; exporting it keeps it, and its worker bundle, in the build.
export const runner = createRunner({ base: chrome.runtime.getURL('pyodide/') });
render(<App />, document.getElementById('app')!);
send({ type: 'ready' });
