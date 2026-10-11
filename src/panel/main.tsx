import { render } from 'preact';
import { App } from './app';
import { listen, send } from './bridge/bridge';
import { flushSaves, initState, openContext, setTheme } from './state';
import { onKey } from './keys';
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
render(<App />, document.getElementById('app')!);
send({ type: 'ready' });
