// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EDIT_DEBOUNCE_MS, startPage } from '../../../src/page/monaco';

type Deco = { range: { startLineNumber: number }; options: { isWholeLine: boolean; className: string } };

class Range {
  startLineNumber: number;
  constructor(line: number, _col: number, _endLine: number, _endCol: number) {
    this.startLineNumber = line;
  }
}

function model(lang: string, text: string) {
  const subs = new Set<() => void>();
  return {
    text,
    getLanguageId: () => lang,
    getValue() {
      return this.text;
    },
    onDidChangeContent(cb: () => void) {
      subs.add(cb);
      return { dispose: () => void subs.delete(cb) };
    },
    type(next: string) {
      this.text = next;
      subs.forEach((cb) => cb());
    },
    watchers: () => subs.size,
  };
}
type Model = ReturnType<typeof model>;

function editor(m: Model, onScreen = true) {
  const ed = {
    decos: [] as Deco[],
    reveals: [] as number[],
    getModel: () => m,
    getDomNode: () => ({ getClientRects: () => (onScreen ? [{}] : []) }),
    createDecorationsCollection: () => ({
      set: (d: Deco[]) => void (ed.decos = d),
      clear: () => void (ed.decos = []),
    }),
    revealLineInCenterIfOutsideViewport: (n: number) => void ed.reveals.push(n),
  };
  return ed;
}
type Ed = ReturnType<typeof editor>;

function monaco(editors: Ed[], models: Model[] = editors.map((e) => e.getModel())) {
  (window as unknown as { monaco: unknown }).monaco = { editor: { getEditors: () => editors, getModels: () => models }, Range };
}

const post = vi.fn();
let stop: () => void;
const sent = () => post.mock.calls.map((c) => c[0]);
const send = (data: unknown, init: Partial<MessageEventInit> = {}) =>
  window.dispatchEvent(new MessageEvent('message', { data, origin: 'https://leetcode.com', source: window, ...init }));
const getCode = (id: number) => send({ source: 'leetvisual', type: 'getCode', id });
const line = (n: number | null, err?: true) => send({ source: 'leetvisual', type: 'line', line: n, ...(err ? { err } : {}) });
const lines = (ed: Ed) => ed.decos.map((d) => [d.range.startLineNumber, d.options.className, d.options.isWholeLine]);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  post.mockReset();
  vi.spyOn(window, 'postMessage').mockImplementation(post);
  stop = startPage(window);
});

afterEach(() => {
  stop();
  delete (window as unknown as { monaco?: unknown }).monaco;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('getCode', () => {
  it('answers with the visible code editor, not the hidden plaintext one, echoing the id', () => {
    monaco([editor(model('plaintext', ''), false), editor(model('python3', 'class Solution:\n    pass\n'))]);
    getCode(7);
    expect(post).toHaveBeenCalledWith(
      { source: 'leetvisual-page', type: 'code', id: 7, code: 'class Solution:\n    pass\n', lang: 'python3' },
      'https://leetcode.com',
    );
  });

  it('falls back to the longest non-plaintext model when no code editor is on screen', () => {
    const short = model('python', 'x');
    const long = model('python', 'x = 1\ny = 2\n');
    monaco([editor(short, false)], [model('plaintext', 'a much longer plaintext buffer'), short, long]);
    getCode(1);
    expect(sent()).toEqual([{ source: 'leetvisual-page', type: 'code', id: 1, code: 'x = 1\ny = 2\n', lang: 'python' }]);
  });

  it('answers no-editor without Monaco, or with only plaintext models', () => {
    getCode(1);
    monaco([editor(model('plaintext', 'abc'), false)]);
    getCode(2);
    expect(sent()).toEqual([
      { source: 'leetvisual-page', type: 'code', id: 1, error: 'no-editor' },
      { source: 'leetvisual-page', type: 'code', id: 2, error: 'no-editor' },
    ]);
  });
});

describe('line', () => {
  it('tints one whole line, scrolls to it, moves with the next line and clears on null', () => {
    const ed = editor(model('python3', 'a\nb\nc\n'));
    monaco([ed]);
    line(2);
    expect(lines(ed)).toEqual([[2, 'lv-line', true]]);
    line(3, true);
    expect(lines(ed)).toEqual([[3, 'lv-line-err', true]]);
    expect(ed.reveals).toEqual([2, 3]);
    line(null);
    expect(lines(ed)).toEqual([]);
  });

  it('does nothing without a code editor on screen', () => {
    const ed = editor(model('python3', 'a'), false);
    monaco([ed]);
    line(1);
    expect(lines(ed)).toEqual([]);
    expect(ed.reveals).toEqual([]);
  });

  // Review Focus 1
  it('moves to the new editor when LeetCode remounts Monaco, clearing the old highlight', () => {
    const old = editor(model('python3', 'a\nb'));
    monaco([old]);
    line(2);
    const fresh = editor(model('python3', 'c\nd'));
    monaco([fresh]);
    line(1);
    expect(lines(old)).toEqual([]);
    expect(lines(fresh)).toEqual([[1, 'lv-line', true]]);
  });
});

describe('edits', () => {
  it('clears the highlight on the first edit and reports codeChanged 300 ms after the last one', async () => {
    const code = model('python3', 'a\nb');
    const ed = editor(code);
    monaco([ed]);
    getCode(1);
    line(2);
    post.mockClear();
    code.type('a\nbb');
    expect(lines(ed)).toEqual([]);
    await vi.advanceTimersByTimeAsync(EDIT_DEBOUNCE_MS - 50);
    code.type('a\nbbb');
    await vi.advanceTimersByTimeAsync(EDIT_DEBOUNCE_MS - 1);
    expect(sent()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent()).toEqual([{ source: 'leetvisual-page', type: 'codeChanged' }]);
  });

  it('watches the code model once, however often it is read or highlighted', () => {
    const code = model('python3', 'a');
    monaco([editor(code)]);
    getCode(1);
    getCode(2);
    line(1);
    expect(code.watchers()).toBe(1);
  });
});

describe('messages', () => {
  it('ignores other windows, other origins, its own answers and malformed requests', () => {
    const ed = editor(model('python3', 'a\nb'));
    monaco([ed]);
    send({ source: 'leetvisual', type: 'getCode', id: 1 }, { source: null });
    send({ source: 'leetvisual', type: 'getCode', id: 1 }, { origin: 'https://evil.example' });
    send({ source: 'leetvisual-page', type: 'code', id: 1, error: 'no-editor' });
    send({ source: 'leetvisual', type: 'getCode' });
    send({ source: 'leetvisual', type: 'line', line: 0 });
    send({ type: 'line', line: 1 });
    expect(sent()).toEqual([]);
    expect(lines(ed)).toEqual([]);
  });

  it('stops listening when stopped', () => {
    monaco([editor(model('python3', 'a'))]);
    stop();
    stop = () => {};
    getCode(1);
    expect(sent()).toEqual([]);
  });
});
