import { describe, expect, it, vi } from 'vitest';
import { listen, send } from '../../../src/panel/bridge/bridge';

type Handler = (e: Partial<MessageEvent>) => void;

function fakeWindow() {
  const handlers = new Set<Handler>();
  const parent = { postMessage: vi.fn() };
  const win = {
    parent,
    addEventListener: (_: string, h: Handler) => handlers.add(h),
    removeEventListener: (_: string, h: Handler) => handlers.delete(h),
  };
  const dispatch = (e: Partial<MessageEvent>) => handlers.forEach((h) => h(e));
  return { win: win as unknown as Window, parent, dispatch, handlers };
}

const theme = { type: 'theme', theme: 'dark' };

describe('listen', () => {
  it('delivers valid messages from the LeetCode parent', () => {
    const { win, parent, dispatch } = fakeWindow();
    const got = vi.fn();
    listen(got, win);
    dispatch({ origin: 'https://leetcode.com', source: parent as unknown as Window, data: theme });
    expect(got).toHaveBeenCalledWith(theme);
  });

  it('ignores a wrong origin, a wrong source and a malformed shape', () => {
    const { win, parent, dispatch } = fakeWindow();
    const got = vi.fn();
    listen(got, win);
    dispatch({ origin: 'https://evil.example', source: parent as unknown as Window, data: theme });
    dispatch({ origin: 'https://leetcode.cn', source: parent as unknown as Window, data: theme });
    dispatch({ origin: 'https://leetcode.com', source: {} as Window, data: theme });
    dispatch({ origin: 'https://leetcode.com', source: null, data: theme });
    dispatch({ origin: 'https://leetcode.com', source: parent as unknown as Window, data: { type: 'theme', theme: 'blue' } });
    dispatch({ origin: 'https://leetcode.com', source: parent as unknown as Window, data: { type: 'context', slug: 'x' } });
    dispatch({ origin: 'https://leetcode.com', source: parent as unknown as Window, data: 'theme' });
    expect(got).not.toHaveBeenCalled();
  });

  it('stops delivering after unsubscribe', () => {
    const { win, parent, dispatch, handlers } = fakeWindow();
    const got = vi.fn();
    const off = listen(got, win);
    off();
    dispatch({ origin: 'https://leetcode.com', source: parent as unknown as Window, data: theme });
    expect(got).not.toHaveBeenCalled();
    expect(handlers.size).toBe(0);
  });
});

describe('send', () => {
  it('posts to the parent with the LeetCode origin as target', () => {
    const { win, parent } = fakeWindow();
    send({ type: 'ready' }, win);
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'ready' }, 'https://leetcode.com');
  });
});
