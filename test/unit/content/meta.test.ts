// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMeta, type MetaDeps } from '../../../src/content/meta';

const TWO_SUM_META = '{\r\n  "name": "twoSum",\r\n  "params": [{"name": "nums", "type": "integer[]"}, {"name": "target", "type": "integer"}],\r\n  "return": {"type": "integer[]"}\r\n}';
const question = { metaData: TWO_SUM_META, exampleTestcases: '[2,7,11,15]\n9\n[3,2,4]\n6', isPaidOnly: false };

function fakeStorage(initial: Record<string, unknown> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get: vi.fn(async (key: string) => (data.has(key) ? { [key]: data.get(key) } : {})),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) data.set(k, v);
    }),
  };
}

const ok = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response;

function deps(over: Partial<MetaDeps> = {}): MetaDeps & { storage: ReturnType<typeof fakeStorage> } {
  return {
    fetch: vi.fn(async () => ok({ data: { question } })),
    storage: fakeStorage(),
    doc: document,
    firstSlug: 'two-sum',
    ...over,
  } as MetaDeps & { storage: ReturnType<typeof fakeStorage> };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  vi.useRealTimers();
});

describe('fetchMeta from GraphQL', () => {
  it('parses metaData with \\r\\n, splits examples and caches the raw answer', async () => {
    const d = deps();
    const r = await fetchMeta('two-sum', d);
    expect(r.meta).toEqual({
      name: 'twoSum',
      params: [{ name: 'nums', type: 'integer[]' }, { name: 'target', type: 'integer' }],
      return: { type: 'integer[]' },
    });
    expect(r.examples).toEqual(['[2,7,11,15]', '9', '[3,2,4]', '6']);
    expect(r.paid).toBe(false);
    expect(d.storage.data.get('lv:meta:two-sum')).toEqual(question);
  });

  it('posts the query same-origin with the slug and the csrf cookie when present', async () => {
    document.cookie = 'csrftoken=tok123';
    const d = deps();
    await fetchMeta('two-sum', d);
    const [url, init] = vi.mocked(d.fetch).mock.calls[0];
    expect(url).toBe('https://leetcode.com/graphql');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect((init.headers as Record<string, string>)['x-csrftoken']).toBe('tok123');
    expect(JSON.parse(init.body as string).variables).toEqual({ titleSlug: 'two-sum' });
  });

  it('omits the csrf header without the cookie', async () => {
    const d = deps();
    await fetchMeta('two-sum', d);
    expect(vi.mocked(d.fetch).mock.calls[0][1].headers).not.toHaveProperty('x-csrftoken');
  });

  it('uses the cache and does not fetch again', async () => {
    const d = deps({ storage: fakeStorage({ 'lv:meta:two-sum': question }) });
    const r = await fetchMeta('two-sum', d);
    expect(d.fetch).not.toHaveBeenCalled();
    expect(r.meta?.name).toBe('twoSum');
  });

  it('still returns the answer when caching it fails', async () => {
    const d = deps();
    d.storage.set.mockRejectedValue(new Error('QUOTA_BYTES quota exceeded'));
    const r = await fetchMeta('two-sum', d);
    expect(r.meta?.name).toBe('twoSum');
    expect(r.examples).toEqual(['[2,7,11,15]', '9', '[3,2,4]', '6']);
  });

  it('flags paid problems', async () => {
    const d = deps({ fetch: vi.fn(async () => ok({ data: { question: { ...question, isPaidOnly: true } } })) });
    expect((await fetchMeta('two-sum', d)).paid).toBe(true);
  });

  it('keeps examples when metaData is not valid JSON or not a Meta', async () => {
    const bad = deps({ fetch: vi.fn(async () => ok({ data: { question: { ...question, metaData: '{not json' } } })) });
    expect(await fetchMeta('two-sum', bad)).toEqual({ meta: null, examples: ['[2,7,11,15]', '9', '[3,2,4]', '6'], paid: false });
    const wrong = deps({ fetch: vi.fn(async () => ok({ data: { question: { ...question, metaData: '{"params": "nums"}' } } })) });
    expect((await fetchMeta('two-sum', wrong)).meta).toBeNull();
  });
});

describe('fetchMeta fallbacks', () => {
  const nextData = (q: Record<string, unknown>) => {
    const s = document.createElement('script');
    s.id = '__NEXT_DATA__';
    s.type = 'application/json';
    s.textContent = JSON.stringify({ props: { pageProps: { dehydratedState: { queries: [{ state: { data: {} } }, { state: { data: { question: q } } }] } } } });
    document.body.append(s);
  };

  it('falls back to __NEXT_DATA__ on the first-load slug after a network failure', async () => {
    nextData({ titleSlug: 'two-sum', metaData: TWO_SUM_META, exampleTestcaseList: ['[2,7,11,15]\n9'], isPaidOnly: false });
    const d = deps({ fetch: vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))) });
    const r = await fetchMeta('two-sum', d);
    expect(r.meta?.name).toBe('twoSum');
    expect(r.examples).toEqual(['[2,7,11,15]', '9']);
  });

  it('abandons a request that does not answer within 5 s', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    nextData({ titleSlug: 'two-sum', metaData: TWO_SUM_META, isPaidOnly: false });
    const hang = (_url: string, init: RequestInit) =>
      new Promise<Response>((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    const r = fetchMeta('two-sum', deps({ fetch: vi.fn(hang) }));
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await r).meta?.name).toBe('twoSum');
  });

  it('ignores __NEXT_DATA__ after in-app navigation to another slug', async () => {
    nextData({ titleSlug: 'two-sum', metaData: TWO_SUM_META, isPaidOnly: false });
    const d = deps({ fetch: vi.fn(async () => ({ ok: false }) as unknown as Response) });
    expect(await fetchMeta('reverse-linked-list', d)).toEqual({ meta: null, examples: [], paid: false });
    expect(d.storage.set).not.toHaveBeenCalled();
  });

  it('returns nothing for a malformed GraphQL answer and no __NEXT_DATA__', async () => {
    const d = deps({ fetch: vi.fn(async () => ok({ errors: [{ message: 'boom' }] })) });
    expect(await fetchMeta('two-sum', d)).toEqual({ meta: null, examples: [], paid: false });
    const d2 = deps({ fetch: vi.fn(async () => ok({ data: { question: { metaData: 5 } } })) });
    expect(await fetchMeta('two-sum', d2)).toEqual({ meta: null, examples: [], paid: false });
    const d3 = deps({ fetch: vi.fn(async () => ({ ok: true, json: async () => Promise.reject(new SyntaxError('bad')) }) as unknown as Response) });
    expect(await fetchMeta('two-sum', d3)).toEqual({ meta: null, examples: [], paid: false });
  });
});
