import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { edit, initHist, newCanvas, nextStep, setLayout } from '../../../src/panel/model/history';
import type { Canvas, VarS } from '../../../src/panel/model/types';
import { hash } from '../../../src/panel/store/hash';
import { chromeKV, type KV } from '../../../src/panel/store/kv';
import {
  canvasKey,
  createSaver,
  decodeCanvas,
  encodeCanvas,
  INDEX_KEY,
  loadCanvas,
  MAX_CANVAS_BYTES,
  MAX_CANVASES,
  SaveError,
  saveCanvas,
} from '../../../src/panel/store/store';
import { arr, board, v } from '../../helpers/boards';
import { memoryKV } from '../../helpers/memory-kv';

// Two frames (x = 0, then x = 1 tagged line 4) and a draft where x = `draft`.
const canvas = (draft = '2'): Canvas => {
  let h = initHist(newCanvas(board(v('s1', '0'), arr('s2', ['1', '2', '3']))));
  h = nextStep(edit(h, { t: 'set', at: { s: 's1', k: 'var' }, val: '1' }), 4)!;
  h = edit(h, { t: 'set', at: { s: 's1', k: 'var' }, val: draft });
  return setLayout(h, { s1: { x: 16, y: 16 } }).canvas;
};

describe('hash and canvasKey', () => {
  it('is stable and distinguishes inputs', () => {
    expect(hash('[2,7,11,15]\n9')).toBe(hash('[2,7,11,15]\n9'));
    expect(hash('[2,7,11,15]\n9')).not.toBe(hash('[2,7,11,15]\n8'));
    expect(hash('')).toMatch(/^[0-9a-z]+$/);
  });

  it('keys by site, slug and the inputs, ignoring \\r and surrounding whitespace', () => {
    const key = canvasKey('two-sum', ['[2,7,11,15]', '9']);
    expect(key).toBe(`leetcode.com:two-sum:${hash('[2,7,11,15]\n9')}`);
    expect(canvasKey('two-sum', [' [2,7,11,15]\r\n', '9 '])).toBe(key);
    expect(canvasKey('3sum', ['[2,7,11,15]', '9'])).not.toBe(key);
    expect(canvasKey('two-sum', ['[2,7,11,15]', '8'])).not.toBe(key);
    expect(canvasKey('s', ['"a b"'])).not.toBe(canvasKey('s', ['"ab"']));
  });
});

describe('encodeCanvas and decodeCanvas', () => {
  it('round-trips through JSON', () => {
    const c = canvas();
    const back = decodeCanvas(JSON.parse(JSON.stringify(encodeCanvas(c))));
    expect(back).toEqual(c);
  });

  it('stores each shared structure once and restores the sharing', () => {
    const c = canvas();
    const stored = encodeCanvas(c) as { pool: unknown[] };
    expect(stored.pool).toHaveLength(4);
    const back = decodeCanvas(JSON.parse(JSON.stringify(stored)))!;
    const [f0, f1] = back.frames;
    expect(f1.board.structs.s2).toBe(f0.board.structs.s2);
    expect(back.draft.structs.s2).toBe(f0.board.structs.s2);
    expect(back.draft.structs.s1).not.toBe(f1.board.structs.s1);
    expect((back.draft.structs.s1 as VarS).value).toBe('2');
    expect(back.frames[1].line).toBe(4);
  });

  it('restores a draft that is the last frame as the same board', () => {
    const c = nextStep(initHist(canvas()))!.canvas;
    const back = decodeCanvas(JSON.parse(JSON.stringify(encodeCanvas(c))))!;
    expect(back.draft).toBe(back.frames[2].board);
  });

  it('ignores an unknown schema version', () => {
    const stored = { ...(encodeCanvas(canvas()) as object), v: 2 };
    expect(decodeCanvas(stored)).toBeNull();
  });

  it.each([
    ['nothing', undefined],
    ['a string', 'canvas'],
    ['no frames', { ...(encodeCanvas(canvas()) as object), frames: [] }],
    ['a bad pool index', { ...(encodeCanvas(canvas()) as object), draft: { s1: 99 } }],
    ['a pool entry under the wrong id', { ...(encodeCanvas(canvas()) as object), draft: { s7: 0 } }],
    ['a missing view', { ...(encodeCanvas(canvas()) as object), view: null }],
    ['a frame that is not an object', { ...(encodeCanvas(canvas()) as object), frames: [7] }],
  ])('ignores a malformed record: %s', (_, x) => {
    expect(decodeCanvas(x)).toBeNull();
  });
});

describe('loadCanvas and saveCanvas', () => {
  it('saves and loads a canvas', async () => {
    const kv = memoryKV();
    const c = canvas();
    await saveCanvas(kv, 'k1', c, 1);
    expect(await loadCanvas(kv, 'k1', 2)).toEqual(c);
    expect(await loadCanvas(kv, 'missing', 3)).toBeNull();
  });

  it('bumps the recently-used index on save and load', async () => {
    const kv = memoryKV();
    await saveCanvas(kv, 'k1', canvas(), 10);
    await saveCanvas(kv, 'k2', canvas(), 20);
    await loadCanvas(kv, 'k1', 30);
    expect(kv.data.get(INDEX_KEY)).toEqual({ k1: 30, k2: 20 });
  });

  it('treats a stored canvas with an unknown v as missing and leaves the index alone', async () => {
    const kv = memoryKV();
    await kv.set('k1', { v: 9 });
    expect(await loadCanvas(kv, 'k1', 5)).toBeNull();
    expect(kv.data.has(INDEX_KEY)).toBe(false);
  });

  it('still returns the canvas when only the index write throws', async () => {
    const kv = memoryKV();
    await saveCanvas(kv, 'k1', canvas(), 1);
    const set = kv.set.bind(kv);
    kv.set = async (key, value) => {
      if (key === INDEX_KEY) throw new Error('QUOTA_BYTES quota exceeded');
      return set(key, value);
    };
    expect(await loadCanvas(kv, 'k1', 5)).toEqual(canvas());
  });

  it(`keeps only the ${MAX_CANVASES} most recently used canvases`, async () => {
    const kv = memoryKV();
    for (let i = 0; i <= MAX_CANVASES; i++) await saveCanvas(kv, `k${i}`, canvas(), i);
    expect(kv.data.has('k0')).toBe(false);
    expect(kv.data.has('k1')).toBe(true);
    expect(kv.data.has(`k${MAX_CANVASES}`)).toBe(true);
    expect(Object.keys(kv.data.get(INDEX_KEY) as object)).toHaveLength(MAX_CANVASES);
  });

  it('never evicts the canvas being saved, even with a stale clock', async () => {
    const kv = memoryKV();
    for (let i = 0; i < MAX_CANVASES; i++) await saveCanvas(kv, `k${i}`, canvas(), 1000 + i);
    await saveCanvas(kv, 'late', canvas(), 0);
    expect(kv.data.has('late')).toBe(true);
    expect(kv.data.has('k0')).toBe(false);
  });

  it('evicts old canvases and retries once on a quota error', async () => {
    const size = JSON.stringify(encodeCanvas(canvas())).length;
    const kv = memoryKV(size * 4);
    await saveCanvas(kv, 'old1', canvas(), 1);
    await saveCanvas(kv, 'old2', canvas(), 2);
    await saveCanvas(kv, 'old3', canvas(), 3);
    await saveCanvas(kv, 'new', canvas('9'), 4);
    expect(kv.data.has('old1')).toBe(false);
    expect(kv.data.has('new')).toBe(true);
    expect(Object.keys(kv.data.get(INDEX_KEY) as object).sort()).toEqual(['new', 'old2', 'old3']);
  });

  it('also evicts stored keys the index has lost', async () => {
    const size = JSON.stringify(encodeCanvas(canvas())).length;
    const kv = memoryKV(size * 4);
    await saveCanvas(kv, 'old1', canvas(), 1);
    await saveCanvas(kv, 'old2', canvas(), 2);
    // Saved by another tab whose index update this tab then overwrote.
    await kv.set('lost', encodeCanvas(canvas()));
    await saveCanvas(kv, 'new', canvas('9'), 3);
    expect(kv.data.has('lost')).toBe(false);
    expect(kv.data.has('old2')).toBe(true);
    expect(kv.data.has('new')).toBe(true);
    expect(Object.keys(kv.data.get(INDEX_KEY) as object).sort()).toEqual(['new', 'old2']);
  });

  it('refuses an oversized canvas without evicting the others', async () => {
    const kv = memoryKV(MAX_CANVAS_BYTES);
    await saveCanvas(kv, 'old', canvas(), 1);
    const huge = newCanvas({ structs: { s1: arr('s1', new Array(MAX_CANVAS_BYTES / 4).fill('1')) } });
    await expect(saveCanvas(kv, 'huge', huge, 2)).rejects.toBeInstanceOf(SaveError);
    expect(kv.data.has('old')).toBe(true);
    expect(kv.data.has('huge')).toBe(false);
  });

  it('throws SaveError when the retry also fails', async () => {
    const kv = memoryKV(100);
    await expect(saveCanvas(kv, 'k1', canvas(), 1)).rejects.toBeInstanceOf(SaveError);
  });

  it('still resolves with the canvas stored when only the index write throws', async () => {
    const kv = memoryKV();
    const set = kv.set.bind(kv);
    kv.set = async (key, value) => {
      if (key === INDEX_KEY) throw new Error('QUOTA_BYTES quota exceeded');
      return set(key, value);
    };
    await expect(saveCanvas(kv, 'k1', canvas(), 1)).resolves.toBeUndefined();
    expect(decodeCanvas(kv.data.get('k1'))).toEqual(canvas());
  });

  it('passes other storage errors through untouched', async () => {
    const boom = new Error('Extension context invalidated.');
    const kv: KV = {
      get: async () => undefined,
      set: async () => Promise.reject(boom),
      remove: async () => {},
      keys: async () => [],
    };
    await expect(saveCanvas(kv, 'k1', canvas(), 1)).rejects.toBe(boom);
  });
});

describe('chromeKV', () => {
  it('maps get, set, remove and keys onto a StorageArea', async () => {
    const store: Record<string, unknown> = {};
    const area: chrome.storage.StorageArea = {
      get: async (k) => (k === null ? { ...store } : typeof k === 'string' && k in store ? { [k]: store[k] } : {}),
      set: async (items) => void Object.assign(store, items),
      remove: async (keys) => {
        for (const k of [keys].flat()) delete store[k];
      },
    };
    const kv = chromeKV(area);
    await kv.set('a', { x: 1 });
    expect(await kv.get('a')).toEqual({ x: 1 });
    expect(await kv.get('b')).toBeUndefined();
    expect(await kv.keys()).toEqual(['a']);
    await kv.remove(['a']);
    expect(store).toEqual({});
  });
});

describe('createSaver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces saves by 500 ms and writes the latest canvas', async () => {
    const kv = memoryKV();
    const saver = createSaver(kv, () => {});
    saver.schedule('k1', canvas('3'));
    await vi.advanceTimersByTimeAsync(300);
    saver.schedule('k1', canvas('4'));
    await vi.advanceTimersByTimeAsync(499);
    expect(kv.data.has('k1')).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(decodeCanvas(kv.data.get('k1'))).toEqual(canvas('4'));
  });

  it('flush writes immediately and cancels the timer', async () => {
    const kv = memoryKV();
    const set = vi.spyOn(kv, 'set');
    const saver = createSaver(kv, () => {});
    saver.schedule('k1', canvas());
    await saver.flush();
    expect(kv.data.has('k1')).toBe(true);
    const writes = set.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(set.mock.calls.length).toBe(writes);
    await saver.flush();
    expect(set.mock.calls.length).toBe(writes);
  });

  it('flushes the pending canvas when a different key is scheduled', async () => {
    const kv = memoryKV();
    const saver = createSaver(kv, () => {});
    saver.schedule('a', canvas('3'));
    saver.schedule('b', canvas('4'));
    await vi.advanceTimersByTimeAsync(0);
    expect(decodeCanvas(kv.data.get('a'))).toEqual(canvas('3'));
    expect(kv.data.has('b')).toBe(false);
    await saver.flush();
    expect(decodeCanvas(kv.data.get('b'))).toEqual(canvas('4'));
  });

  it('runs writes one after another, so a slow write cannot land after a newer one', async () => {
    const kv = memoryKV();
    const order: string[] = [];
    const set = kv.set.bind(kv);
    kv.set = async (key, value) => {
      if (key === 'k1') await new Promise((r) => setTimeout(r, 100));
      order.push(key === INDEX_KEY ? 'index' : `${key}:${(decodeCanvas(value)?.draft.structs.s1 as VarS).value}`);
      return set(key, value);
    };
    const saver = createSaver(kv, () => {});
    saver.schedule('k1', canvas('3'));
    const first = saver.flush();
    saver.schedule('k1', canvas('5'));
    const second = saver.flush();
    await vi.advanceTimersByTimeAsync(300);
    await Promise.all([first, second]);
    expect(order).toEqual(['k1:3', 'index', 'k1:5', 'index']);
    expect((decodeCanvas(kv.data.get('k1'))!.draft.structs.s1 as VarS).value).toBe('5');
  });

  it('reports failures to onError and keeps working', async () => {
    const onError = vi.fn();
    const saver = createSaver(memoryKV(10), onError);
    saver.schedule('k1', canvas());
    await saver.flush();
    expect(onError).toHaveBeenCalledWith(expect.any(SaveError));
    saver.schedule('k1', canvas());
    await saver.flush();
    expect(onError).toHaveBeenCalledTimes(2);
  });
});
