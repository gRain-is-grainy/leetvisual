import { render } from 'preact';
import { App } from './app';
import { listen, send } from './bridge/bridge';
import { flushSaves, initState, openContext, setTheme, showNotice } from './state';
import { onKey } from './keys';
import { createRunner } from './runner/runner';
import { chromeKV } from './store/kv';
import { initTracer, onCode, onCodeChanged, onContext } from './tracer';
import './styles.css';

// Trace mode runs code through this. Creating it starts no worker; exporting it keeps it, and its worker bundle, in the build.
export const runner = createRunner({ base: chrome.runtime.getURL('pyodide/') });

const kv = chromeKV(chrome.storage.local);
initState(kv);
initTracer({ runner, send, kv, notify: showNotice });
setTheme(location.hash === '#dark' ? 'dark' : 'light');
listen((msg) => {
  switch (msg.type) {
    case 'context':
      void openContext(msg);
      void onContext(msg);
      break;
    case 'theme':
      setTheme(msg.theme);
      break;
    case 'code':
      onCode(msg);
      break;
    case 'codeChanged':
      onCodeChanged();
      break;
  }
});
window.addEventListener('pagehide', () => void flushSaves());
window.addEventListener('keydown', onKey);
render(<App />, document.getElementById('app')!);
send({ type: 'ready' });
