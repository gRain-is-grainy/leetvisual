import {
  isFromPage,
  LEETCODE_ORIGIN,
  TO_PAGE,
  type CodeChangedMsg,
  type CodeMsg,
  type GetCodeMsg,
  type LineMsg,
  type ToPage,
} from '../shared/messages';

export const PAGE_TIMEOUT_MS = 1_000;

export type CodeRelay = { fromPanel(m: GetCodeMsg | LineMsg): void; shown(on: boolean): void; stop(): void };

const lineTo = (line: number | null, err?: true): ToPage =>
  err ? { source: TO_PAGE, type: 'line', line, err } : { source: TO_PAGE, type: 'line', line };

// Carries the panel's code requests and highlights to the MAIN-world page script, and its answers back (spec §3.2).
export function createCodeRelay(win: Window, toPanel: (m: CodeMsg | CodeChangedMsg) => void): CodeRelay {
  const waiting = new Map<number, ReturnType<typeof setTimeout>>();
  let nextId = 1;
  let line: LineMsg | null = null; // the highlight the panel wants, kept while the iframe is hidden
  let visible = false;

  const toPage = (m: ToPage) => win.postMessage(m, LEETCODE_ORIGIN);

  function onPage(e: MessageEvent) {
    const msg: unknown = e.data;
    if (e.source !== win || e.origin !== LEETCODE_ORIGIN || !isFromPage(msg)) return;
    if (msg.type === 'codeChanged') return toPanel({ type: 'codeChanged' });
    const timer = waiting.get(msg.id);
    if (timer === undefined) return; // already answered no-editor at the timeout, or not ours
    clearTimeout(timer);
    waiting.delete(msg.id);
    toPanel('error' in msg ? { type: 'code', error: 'no-editor' } : { type: 'code', code: msg.code, lang: msg.lang });
  }
  win.addEventListener('message', onPage);

  return {
    fromPanel(m) {
      if (m.type === 'getCode') {
        const id = nextId++;
        const timer = setTimeout(() => {
          waiting.delete(id);
          toPanel({ type: 'code', error: 'no-editor' }); // no page script, or no Monaco (spec §7.2)
        }, PAGE_TIMEOUT_MS);
        waiting.set(id, timer);
        toPage({ source: TO_PAGE, type: 'getCode', id });
        return;
      }
      line = m.line === null ? null : m;
      if (visible) toPage(lineTo(m.line, m.err));
    },
    shown(on) {
      if (on === visible) return;
      visible = on;
      if (line) toPage(on ? lineTo(line.line, line.err) : lineTo(null));
    },
    stop() {
      win.removeEventListener('message', onPage);
      waiting.forEach(clearTimeout);
      waiting.clear();
      if (line && visible) toPage(lineTo(null));
      line = null;
    },
  };
}
