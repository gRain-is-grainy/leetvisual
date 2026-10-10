import { isToPanel, LEETCODE_ORIGIN, type ToContent, type ToPanel } from '../../shared/messages';

export function listen(onMsg: (m: ToPanel) => void, win: Window = window): () => void {
  const handler = (e: MessageEvent) => {
    if (e.origin !== LEETCODE_ORIGIN || e.source !== win.parent || !isToPanel(e.data)) return;
    onMsg(e.data);
  };
  win.addEventListener('message', handler);
  return () => win.removeEventListener('message', handler);
}

export function send(m: ToContent, win: Window = window): void {
  win.parent.postMessage(m, LEETCODE_ORIGIN);
}
