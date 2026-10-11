// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCodeRelay, PAGE_TIMEOUT_MS, type CodeRelay } from '../../../src/content/code';

const toPage = vi.fn();
const toPanel = vi.fn();
let relay: CodeRelay;
const page = () => toPage.mock.calls.map((c) => c[0]);
const panel = () => toPanel.mock.calls.map((c) => c[0]);
const fromPage = (data: unknown, init: Partial<MessageEventInit> = {}) =>
  window.dispatchEvent(new MessageEvent('message', { data, origin: 'https://leetcode.com', source: window, ...init }));
const lineMsg = (line: number | null, err?: true) => ({ source: 'leetvisual', type: 'line', line, ...(err ? { err } : {}) });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  toPage.mockReset();
  toPanel.mockReset();
  vi.spyOn(window, 'postMessage').mockImplementation(toPage);
  relay = createCodeRelay(window, toPanel);
});

afterEach(() => {
  relay.stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('getCode', () => {
  it('asks the page script with a fresh id and relays its answer for that id', () => {
    relay.fromPanel({ type: 'getCode' });
    relay.fromPanel({ type: 'getCode' });
    expect(toPage).toHaveBeenCalledWith({ source: 'leetvisual', type: 'getCode', id: 1 }, 'https://leetcode.com');
    expect(page()).toEqual([
      { source: 'leetvisual', type: 'getCode', id: 1 },
      { source: 'leetvisual', type: 'getCode', id: 2 },
    ]);
    fromPage({ source: 'leetvisual-page', type: 'code', id: 2, code: 'x = 1', lang: 'python3' });
    expect(panel()).toEqual([{ type: 'code', code: 'x = 1', lang: 'python3' }]);
  });

  it('relays a no-editor answer', () => {
    relay.fromPanel({ type: 'getCode' });
    fromPage({ source: 'leetvisual-page', type: 'code', id: 1, error: 'no-editor' });
    expect(panel()).toEqual([{ type: 'code', error: 'no-editor' }]);
  });

  // Review Focus 2
  it('answers no-editor after 1 s without a page answer, and drops a late answer', async () => {
    relay.fromPanel({ type: 'getCode' });
    await vi.advanceTimersByTimeAsync(PAGE_TIMEOUT_MS - 1);
    expect(panel()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(panel()).toEqual([{ type: 'code', error: 'no-editor' }]);
    fromPage({ source: 'leetvisual-page', type: 'code', id: 1, code: 'x = 1', lang: 'python3' });
    expect(panel()).toEqual([{ type: 'code', error: 'no-editor' }]);
  });

  it('relays edit notices', () => {
    fromPage({ source: 'leetvisual-page', type: 'codeChanged' });
    expect(panel()).toEqual([{ type: 'codeChanged' }]);
  });

  it('ignores other windows, other origins, unknown ids and malformed answers', () => {
    relay.fromPanel({ type: 'getCode' });
    const answer = { source: 'leetvisual-page', type: 'code', id: 1, code: 'x', lang: 'python3' };
    fromPage(answer, { source: null });
    fromPage(answer, { origin: 'https://evil.example' });
    fromPage({ ...answer, id: 9 });
    fromPage({ ...answer, source: 'leetvisual' });
    fromPage({ source: 'leetvisual-page', type: 'code', id: 1, code: 'x' });
    expect(panel()).toEqual([]);
  });
});

describe('line', () => {
  it('shows lines only while the iframe is shown, clears while hidden and restores when shown', () => {
    relay.fromPanel({ type: 'line', line: 4 });
    expect(page()).toEqual([]);
    relay.shown(true);
    expect(page()).toEqual([lineMsg(4)]);
    relay.fromPanel({ type: 'line', line: 5, err: true });
    relay.shown(false);
    relay.shown(false);
    relay.shown(true);
    expect(page()).toEqual([lineMsg(4), lineMsg(5, true), lineMsg(null), lineMsg(5, true)]);
    expect(toPage).toHaveBeenLastCalledWith(lineMsg(5, true), 'https://leetcode.com');
  });

  it('forgets the line once the panel clears it', () => {
    relay.shown(true);
    relay.fromPanel({ type: 'line', line: 2 });
    relay.fromPanel({ type: 'line', line: null });
    relay.shown(false);
    relay.shown(true);
    expect(page()).toEqual([lineMsg(2), lineMsg(null)]);
  });
});

describe('stop', () => {
  it('clears a shown highlight, stops listening and cancels pending answers', async () => {
    relay.shown(true);
    relay.fromPanel({ type: 'line', line: 3 });
    relay.fromPanel({ type: 'getCode' });
    relay.stop();
    expect(page().at(-1)).toEqual(lineMsg(null));
    fromPage({ source: 'leetvisual-page', type: 'codeChanged' });
    await vi.advanceTimersByTimeAsync(PAGE_TIMEOUT_MS);
    expect(panel()).toEqual([]);
  });
});
