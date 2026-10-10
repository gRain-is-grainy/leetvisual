import type { KV } from '../../src/panel/store/kv';

// An in-memory KV that copies through JSON like chrome.storage does, with an optional byte quota.
export function memoryKV(quota?: number): KV & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  const copy = (x: unknown) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  return {
    data,
    async get(key) {
      return copy(data.get(key));
    },
    async set(key, value) {
      const had = data.has(key);
      const prev = data.get(key);
      data.set(key, copy(value));
      if (quota !== undefined && JSON.stringify([...data]).length > quota) {
        if (had) data.set(key, prev);
        else data.delete(key);
        throw new Error('QUOTA_BYTES quota exceeded');
      }
    },
    async remove(keys) {
      for (const k of keys) data.delete(k);
    },
    async keys() {
      return [...data.keys()];
    },
  };
}
