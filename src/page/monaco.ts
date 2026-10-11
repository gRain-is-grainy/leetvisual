import { FROM_PAGE, isToPage, LEETCODE_ORIGIN, type FromPage } from '../shared/messages';

export const EDIT_DEBOUNCE_MS = 300;

// The part of Monaco's API this script uses. window.monaco exists only in the page's own world (spec §3.1).
type Disposable = { dispose(): void };
type Model = { getLanguageId(): string; getValue(): string; onDidChangeContent(cb: () => void): Disposable };
type Decorations = { set(decorations: unknown[]): void; clear(): void };
type Editor = {
  getModel(): Model | null;
  getDomNode(): HTMLElement | null;
  createDecorationsCollection(): Decorations;
  revealLineInCenterIfOutsideViewport(line: number): void;
};
type Monaco = {
  editor: { getEditors(): Editor[]; getModels(): Model[] };
  Range: new (startLine: number, startCol: number, endLine: number, endCol: number) => unknown;
};

const PLAIN = 'plaintext';

function monacoIn(win: Window): Monaco | null {
  const m = (win as Window & { monaco?: Monaco }).monaco;
  return m?.editor ? m : null;
}

// The code editor: not LeetCode's hidden plaintext editor, and on screen.
function findEditor(m: Monaco): Editor | null {
  return (
    m.editor.getEditors().find((ed) => {
      const model = ed.getModel();
      return !!model && model.getLanguageId() !== PLAIN && (ed.getDomNode()?.getClientRects().length ?? 0) > 0;
    }) ?? null
  );
}

function longestModel(m: Monaco): Model | null {
  let best: Model | null = null;
  for (const model of m.editor.getModels()) {
    if (model.getLanguageId() !== PLAIN && (!best || model.getValue().length > best.getValue().length)) best = model;
  }
  return best;
}

export function startPage(win: Window): () => void {
  let editor: Editor | null = null; // the editor that holds (or last held) the highlight
  let decorations: Decorations | null = null;
  let lit = false;
  let watched: Model | null = null;
  let watch: Disposable | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const post = (m: FromPage) => win.postMessage(m, LEETCODE_ORIGIN);

  function clear() {
    decorations?.clear();
    lit = false;
  }

  // LeetCode remounts Monaco on a problem switch: a new editor gets its own collection, and the old tint goes.
  function use(ed: Editor) {
    if (ed === editor) return;
    clear();
    editor = ed;
    decorations = ed.createDecorationsCollection();
  }

  function watchEdits(model: Model) {
    if (model === watched) return;
    watch?.dispose();
    watched = model;
    watch = model.onDidChangeContent(() => {
      if (lit) clear(); // the trace no longer matches the code (spec §6.4)
      clearTimeout(timer);
      timer = setTimeout(() => post({ source: FROM_PAGE, type: 'codeChanged' }), EDIT_DEBOUNCE_MS);
    });
  }

  function getCode(id: number) {
    const m = monacoIn(win);
    const ed = m && findEditor(m);
    const model = ed?.getModel() ?? (m && longestModel(m));
    if (!model) return post({ source: FROM_PAGE, type: 'code', id, error: 'no-editor' });
    if (ed) use(ed);
    watchEdits(model);
    post({ source: FROM_PAGE, type: 'code', id, code: model.getValue(), lang: model.getLanguageId() });
  }

  function show(line: number | null, err: boolean) {
    if (line === null) return clear();
    const m = monacoIn(win);
    const ed = m && findEditor(m);
    if (!m || !ed) return; // a model alone has no editor to draw on
    use(ed);
    decorations!.set([
      { range: new m.Range(line, 1, line, 1), options: { isWholeLine: true, className: err ? 'lv-line-err' : 'lv-line' } },
    ]);
    ed.revealLineInCenterIfOutsideViewport(line);
    lit = true;
    const model = ed.getModel();
    if (model) watchEdits(model);
  }

  const onMessage = (e: MessageEvent) => {
    const msg: unknown = e.data;
    if (e.source !== win || e.origin !== LEETCODE_ORIGIN || !isToPage(msg)) return;
    if (msg.type === 'getCode') getCode(msg.id);
    else show(msg.line, msg.err === true);
  };
  win.addEventListener('message', onMessage);
  return () => {
    win.removeEventListener('message', onMessage);
    watch?.dispose();
    clearTimeout(timer);
  };
}
