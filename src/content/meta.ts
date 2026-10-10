import { isMeta, LEETCODE_ORIGIN, type Meta } from '../shared/messages';

export type MetaResult = { meta: Meta | null; examples: string[]; paid: boolean };
export type MetaStorage = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};
export type MetaDeps = {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  storage: MetaStorage;
  doc: Document;
  firstSlug: string | null;
};

type Raw = { metaData: string | null; exampleTestcases: string | null; isPaidOnly: boolean };

const QUERY = 'query q($titleSlug: String!) { question(titleSlug: $titleSlug) { metaData exampleTestcases isPaidOnly } }';
const NONE: MetaResult = { meta: null, examples: [], paid: false };
const TIMEOUT_MS = 5_000;

const strOrNull = (x: unknown) => x === null || typeof x === 'string';

function asRaw(x: unknown): Raw | null {
  if (typeof x !== 'object' || x === null) return null;
  const q = x as Record<string, unknown>;
  if (!strOrNull(q.metaData) || !strOrNull(q.exampleTestcases) || typeof q.isPaidOnly !== 'boolean') return null;
  return { metaData: q.metaData as string | null, exampleTestcases: q.exampleTestcases as string | null, isPaidOnly: q.isPaidOnly };
}

async function fromGraphql(slug: string, deps: MetaDeps): Promise<Raw | null> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const token = /(?:^|;\s*)csrftoken=([^;]+)/.exec(deps.doc.cookie)?.[1];
  if (token) headers['x-csrftoken'] = token;
  // A timer of our own rather than AbortSignal.timeout(), which fake timers cannot drive.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await deps.fetch(`${LEETCODE_ORIGIN}/graphql`, {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify({ query: QUERY, variables: { titleSlug: slug } }),
      signal: abort.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { question?: unknown } } | null;
    return asRaw(body?.data?.question);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function fromNextData(slug: string, deps: MetaDeps): Raw | null {
  if (slug !== deps.firstSlug) return null;
  try {
    const data = JSON.parse(deps.doc.getElementById('__NEXT_DATA__')?.textContent ?? '');
    for (const q of data?.props?.pageProps?.dehydratedState?.queries ?? []) {
      const question = q?.state?.data?.question;
      if (typeof question?.metaData !== 'string' || (question.titleSlug !== undefined && question.titleSlug !== slug)) continue;
      const list = question.exampleTestcaseList;
      return {
        metaData: question.metaData,
        exampleTestcases: Array.isArray(list) ? list.join('\n') : null,
        isPaidOnly: question.isPaidOnly === true,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function parseMeta(text: string | null): Meta | null {
  if (text === null) return null;
  try {
    const meta: unknown = JSON.parse(text.replace(/\r/g, ''));
    return isMeta(meta) ? meta : null;
  } catch {
    return null;
  }
}

export async function fetchMeta(slug: string, deps: MetaDeps): Promise<MetaResult> {
  const key = `lv:meta:${slug}`;
  let raw = asRaw((await deps.storage.get(key))[key]);
  if (!raw) {
    raw = await fromGraphql(slug, deps);
    // Best-effort: a full storage must not throw away a good answer.
    if (raw) await deps.storage.set({ [key]: raw }).catch(() => {});
    else raw = fromNextData(slug, deps); // served now, never cached
  }
  if (!raw) return NONE;
  const examples = raw.exampleTestcases ? raw.exampleTestcases.replace(/\r/g, '').replace(/\n$/, '').split('\n') : [];
  return { meta: parseMeta(raw.metaData), examples, paid: raw.isPaidOnly };
}
