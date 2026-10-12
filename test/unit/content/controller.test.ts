// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"navigation":{"disableChildFrameNavigation":true}}}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createController, type Controller, type ControllerDeps } from '../../../src/content/controller';
import { loadFixture } from '../../fixtures/load';

const TWO_SUM = { name: 'twoSum', params: [{ name: 'nums', type: 'integer[]' }, { name: 'target', type: 'integer' }] };
const REVERSE = { name: 'reverseList', params: [{ name: 'head', type: 'ListNode' }] };
const raw = (m: object, ex: string) => ({ metaData: JSON.stringify(m), exampleTestcases: ex, isPaidOnly: false });
const EXT = 'chrome-extension://abc';

let runtime: { id: string | undefined; getURL(p: string): string };
let ctl: Controller | null = null;

function storage(): ControllerDeps['storage'] {
  const data = new Map<string, unknown>([
    ['lv:meta:two-sum', raw(TWO_SUM, '[2,7,11,15]\n9')],
    ['lv:meta:reverse-linked-list', raw(REVERSE, '[1,2,3,4,5]')],
  ]);
  return {
    get: async (k: string) => (data.has(k) ? { [k]: data.get(k) } : {}),
    set: async () => {},
  };
}

function start(over: Partial<ControllerDeps> = {}) {
  ctl = createController({ runtime, storage: storage(), fetch: vi.fn(async () => Promise.reject(new TypeError('offline'))), ...over });
  ctl.start();
}

const flush = (ms = 20) => vi.advanceTimersByTimeAsync(ms);
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const tab = () => $('[data-leetvisual-tab]');
const frame = () => $<HTMLIFrameElement>('iframe[data-leetvisual-frame]');
const tabset = () => $('[data-layout-path="/c1/ts1"]')!;
const ready = (source: unknown, origin = EXT) =>
  window.dispatchEvent(new MessageEvent('message', { origin, source: source as Window, data: { type: 'ready' } }));
const fromPanel = (data: unknown) =>
  window.dispatchEvent(new MessageEvent('message', { origin: EXT, source: frame()!.contentWindow as unknown as Window, data }));

async function open() {
  tab()!.click();
  const post = vi.spyOn(frame()!.contentWindow!, 'postMessage').mockImplementation(() => {});
  ready(frame()!.contentWindow);
  await flush();
  return post;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
  loadFixture();
  history.replaceState({}, '', '/problems/two-sum/description/');
  runtime = { id: 'abc', getURL: (p) => `${EXT}/${p}` };
});

afterEach(() => {
  ctl?.stop();
  ctl = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Canvas tab', () => {
  it('is added once and re-added after React removes it', async () => {
    start();
    expect(document.querySelectorAll('[data-leetvisual-tab]')).toHaveLength(1);
    tab()!.remove();
    await flush();
    expect(document.querySelectorAll('[data-leetvisual-tab]')).toHaveLength(1);
  });

  it('is not added on pages that are not problems', async () => {
    history.replaceState({}, '', '/problemset/');
    start();
    await flush();
    expect(tab()).toBeNull();
  });

  it('warns once when no anchor appears on a problem page within 10 s', async () => {
    tabset().remove();
    $('[data-e2e-locator="console-run-button"]')!.remove();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    start();
    await flush(9_000);
    expect(warn).not.toHaveBeenCalled();
    await flush(1_100);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('tried testcase tab bar, run button');
    document.body.append(document.createElement('div'));
    await flush(20_000);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('panel', () => {
  it('opens over the testcase content and sends the context after ready', async () => {
    start();
    vi.spyOn(tabset().querySelector('.flexlayout__tabset_content')!, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 20,
      width: 300,
      height: 200,
    } as DOMRect);
    const post = await open();
    const f = frame()!;
    expect(f.getAttribute('src')).toBe(`${EXT}/panel.html#light`);
    expect(f.style.display).toBe('block');
    expect([f.style.left, f.style.top, f.style.width, f.style.height]).toEqual(['10px', '20px', '300px', '200px']);
    expect(tab()!.getAttribute('aria-selected')).toBe('true');
    expect(tabset().hasAttribute('data-leetvisual-active')).toBe(true);
    expect(post).toHaveBeenCalledWith(
      { type: 'context', slug: 'two-sum', metaData: TWO_SUM, inputs: ['[2,7,11,15]', '9'], theme: 'light' },
      EXT,
    );
  });

  it('uses the floating box when only the run button exists', async () => {
    tabset().remove();
    start();
    $('[data-leetvisual-float]')!.click();
    const f = frame()!;
    expect([f.style.left, f.style.top, f.style.width, f.style.height]).toEqual([
      `${innerWidth - Math.min(560, innerWidth * 0.9) - 16}px`,
      `${innerHeight - Math.min(420, innerHeight * 0.6) - 16}px`,
      `${Math.min(560, innerWidth * 0.9)}px`,
      `${Math.min(420, innerHeight * 0.6)}px`,
    ]);
  });

  it('ignores ready messages from a foreign origin or another source', async () => {
    start();
    tab()!.click();
    const post = vi.spyOn(frame()!.contentWindow!, 'postMessage').mockImplementation(() => {});
    ready(frame()!.contentWindow, 'https://evil.example');
    ready(window);
    ready(null);
    await flush(400);
    expect(post).not.toHaveBeenCalled();
    ready(frame()!.contentWindow);
    await flush();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('re-sends the context 300 ms after the last input edit', async () => {
    start();
    const post = await open();
    post.mockClear();
    $('[data-e2e-locator="console-testcase-input"]')!.textContent = '[3,2,4]';
    await flush(250);
    expect(post).not.toHaveBeenCalled();
    $('[data-e2e-locator="console-testcase-input"]')!.textContent = '[3,3]';
    await flush(250);
    expect(post).not.toHaveBeenCalled();
    await flush(100);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toMatchObject({ slug: 'two-sum', inputs: ['[3,3]', '9'] });
  });

  it('sends one new context, with the new inputs, when the slug changes', async () => {
    start();
    const post = await open();
    post.mockClear();
    history.pushState({}, '', '/problems/reverse-linked-list/');
    document.body.append(document.createElement('div'));
    await flush(1_000);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toEqual({ type: 'slug', slug: 'reverse-linked-list' });
    post.mockClear();
    const inputs = document.querySelectorAll('[data-e2e-locator="console-testcase-input"]');
    inputs[1].remove();
    inputs[0].textContent = '[1,2,3,4,5]';
    await flush(400);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toEqual({
      type: 'context',
      slug: 'reverse-linked-list',
      metaData: REVERSE,
      inputs: ['[1,2,3,4,5]'],
      theme: 'light',
    });
  });

  it('posts the new slug at once, before its metadata loads', async () => {
    start({ fetch: vi.fn(() => new Promise<never>(() => {})) });
    const post = await open();
    post.mockClear();
    history.pushState({}, '', '/problems/not-cached/');
    document.body.append(document.createElement('div'));
    await flush(50);
    expect(post.mock.calls.map((c) => c[0])).toEqual([{ type: 'slug', slug: 'not-cached' }]);
  });

  it('waits for the new inputs when the panel opens while the old ones linger', async () => {
    start();
    history.pushState({}, '', '/problems/reverse-linked-list/');
    document.body.append(document.createElement('div'));
    await flush();
    const post = await open();
    expect(post).not.toHaveBeenCalled();
    const inputs = document.querySelectorAll('[data-e2e-locator="console-testcase-input"]');
    inputs[1].remove();
    inputs[0].textContent = '[1,2,3,4,5]';
    await flush(400);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toMatchObject({ slug: 'reverse-linked-list', metaData: REVERSE, inputs: ['[1,2,3,4,5]'] });
  });

  it('sends the unchanged inputs after 3 s, for problems whose inputs really match', async () => {
    start();
    const post = await open();
    post.mockClear();
    history.pushState({}, '', '/problems/reverse-linked-list/');
    document.body.append(document.createElement('div'));
    await flush(2_900);
    expect(post.mock.calls.map((c) => c[0])).toEqual([{ type: 'slug', slug: 'reverse-linked-list' }]); // no context yet
    await flush(500);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][0]).toMatchObject({ type: 'context', slug: 'reverse-linked-list', inputs: ['[2,7,11,15]', '9'] });
  });

  it('sends theme changes live', async () => {
    start();
    const post = await open();
    post.mockClear();
    document.documentElement.className = 'dark';
    await flush();
    expect(post).toHaveBeenCalledWith({ type: 'theme', theme: 'dark' }, EXT);
  });

  it('carries a theme changed before ready in the first context instead of a theme message', async () => {
    start();
    tab()!.click();
    const post = vi.spyOn(frame()!.contentWindow!, 'postMessage').mockImplementation(() => {});
    document.documentElement.className = 'dark';
    await flush();
    expect(post).not.toHaveBeenCalled();
    ready(frame()!.contentWindow);
    await flush();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toMatchObject({ type: 'context', theme: 'dark' });
  });

  it('drops metaData and examples of paid problems unless the page shows the problem', async () => {
    const paid = { ...raw(TWO_SUM, '[2,7,11,15]\n9'), isPaidOnly: true };
    const store = { get: async (k: string) => ({ [k]: paid }), set: async () => {} };
    start({ storage: store });
    let post = await open();
    expect(post.mock.calls[0][0]).toMatchObject({ metaData: TWO_SUM, inputs: ['[2,7,11,15]', '9'] });
    ctl!.stop();
    document.querySelectorAll('[data-e2e-locator="console-testcase-input"], .cm-editor').forEach((el) => el.remove());
    start({ storage: store });
    post = await open();
    expect(post.mock.calls[0][0]).toMatchObject({ metaData: null, inputs: [] });
  });

  it('counts only ready as the panel being ready', async () => {
    start();
    tab()!.click();
    vi.spyOn(window, 'postMessage').mockImplementation(() => {}); // requests for the page script
    const post = vi.spyOn(frame()!.contentWindow!, 'postMessage').mockImplementation(() => {});
    fromPanel({ type: 'getCode' });
    fromPanel({ type: 'line', line: 3 });
    await flush(400);
    expect(post).not.toHaveBeenCalled();
    ready(frame()!.contentWindow);
    await flush();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toMatchObject({ type: 'context' });
  });
});

describe('hiding', () => {
  it('hides when LeetCode selects Test Result on its own', async () => {
    start();
    await open();
    $('[data-layout-path="/c1/ts1/tb0"]')!.className = 'flexlayout__tab_button flexlayout__tab_button_top flexlayout__tab_button--unselected';
    $('[data-layout-path="/c1/ts1/tb1"]')!.className = 'flexlayout__tab_button flexlayout__tab_button_top flexlayout__tab_button--selected';
    await flush();
    expect(frame()!.style.display).toBe('none');
    expect(frame()!.isConnected).toBe(true);
    expect(tab()!.getAttribute('aria-selected')).toBe('false');
    expect(tabset().hasAttribute('data-leetvisual-active')).toBe(false);
  });

  it('hides when the user presses another tab in that tabset, and reopens on Canvas', async () => {
    const press = (sel: string) => $(sel)!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    start();
    await open();
    press('[data-leetvisual-tab]');
    press('#description_tab');
    expect(frame()!.style.display).toBe('block');
    press('#testcase_tab');
    expect(frame()!.style.display).toBe('none');
    tab()!.click();
    expect(frame()!.style.display).toBe('block');
  });

  it('hides when the user runs or submits while Test Result is already underneath', async () => {
    const key = (target: Element, init: KeyboardEventInit) => target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
    $('[data-layout-path="/c1/ts1/tb0"]')!.className = 'flexlayout__tab_button flexlayout__tab_button_top flexlayout__tab_button--unselected';
    $('[data-layout-path="/c1/ts1/tb1"]')!.className = 'flexlayout__tab_button flexlayout__tab_button_top flexlayout__tab_button--selected';
    start();
    await open();
    key(document.body, { key: 'Enter' });
    expect(frame()!.style.display).toBe('block');
    $('[data-e2e-locator="console-run-button"]')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(frame()!.style.display).toBe('none');
    tab()!.click();
    key(document.body, { key: 'Enter', ctrlKey: true });
    expect(frame()!.style.display).toBe('none');
    tab()!.click();
    key($('[data-e2e-locator="console-submit-button"]')!, { key: ' ' });
    expect(frame()!.style.display).toBe('none');
  });
});

describe('teardown', () => {
  it('removes the tab, iframe, style and attribute when the extension context is gone', async () => {
    start();
    await open();
    runtime.id = undefined;
    document.body.append(document.createElement('div'));
    await flush();
    expect(
      document.querySelectorAll('[data-leetvisual-tab], [data-leetvisual-divider], iframe[data-leetvisual-frame], style[data-leetvisual-style], [data-leetvisual-active]'),
    ).toHaveLength(0);
    document.body.append(document.createElement('div'));
    await flush();
    expect(tab()).toBeNull();
  });

  it('removes the tab and style even if the panel was never opened', async () => {
    start();
    runtime.id = undefined;
    document.body.append(document.createElement('div'));
    await flush();
    expect(document.querySelectorAll('[data-leetvisual-tab], [data-leetvisual-divider], style[data-leetvisual-style]')).toHaveLength(0);
  });

  it('tears down instead of posting when the context is gone at a theme change', async () => {
    start();
    const post = await open();
    post.mockClear();
    runtime.id = undefined;
    document.documentElement.className = 'dark';
    await flush();
    expect(post).not.toHaveBeenCalled();
    expect(frame()).toBeNull();
  });

  it('stops when a chrome call throws "Extension context invalidated"', async () => {
    start({
      storage: {
        get: async () => Promise.reject(new Error('Extension context invalidated.')),
        set: async () => {},
      },
    });
    await flush();
    expect(tab()).toBeNull();
  });
});

describe('code relay', () => {
  const fromPage = (data: unknown) =>
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://leetcode.com', source: window, data }));
  const lineTo = (line: number | null, err?: true) => ({ source: 'leetvisual', type: 'line', line, ...(err ? { err } : {}) });

  it('passes getCode to the page script, and its answer and edit notices back to the panel', async () => {
    start();
    const post = await open();
    post.mockClear();
    const toPage = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    fromPanel({ type: 'getCode' });
    expect(toPage).toHaveBeenCalledWith({ source: 'leetvisual', type: 'getCode', id: 1 }, 'https://leetcode.com');
    fromPage({ source: 'leetvisual-page', type: 'code', id: 1, code: 'x = 1', lang: 'python3' });
    expect(post).toHaveBeenCalledWith({ type: 'code', code: 'x = 1', lang: 'python3' }, EXT);
    fromPage({ source: 'leetvisual-page', type: 'codeChanged' });
    expect(post).toHaveBeenLastCalledWith({ type: 'codeChanged' }, EXT);
  });

  it('clears the highlight while the canvas is hidden and restores it when shown', async () => {
    start();
    await open();
    const toPage = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    fromPanel({ type: 'line', line: 4 });
    expect(toPage).toHaveBeenLastCalledWith(lineTo(4), 'https://leetcode.com');
    $('#testcase_tab')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(frame()!.style.display).toBe('none');
    expect(toPage).toHaveBeenLastCalledWith(lineTo(null), 'https://leetcode.com');
    tab()!.click();
    expect(toPage).toHaveBeenLastCalledWith(lineTo(4), 'https://leetcode.com');
  });

  it('clears the highlight before removing its UI when the extension goes away', async () => {
    start();
    await open();
    const iframeThere: boolean[] = [];
    const toPage = vi.spyOn(window, 'postMessage').mockImplementation(() => void iframeThere.push(!!frame()?.isConnected));
    fromPanel({ type: 'line', line: 2, err: true });
    runtime.id = undefined;
    document.body.append(document.createElement('div'));
    await flush();
    expect(toPage).toHaveBeenLastCalledWith(lineTo(null), 'https://leetcode.com');
    expect(iframeThere).toEqual([true, true]);
    expect(frame()).toBeNull();
  });
});
