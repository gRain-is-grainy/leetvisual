export interface KV {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(keys: string[]): Promise<void>;
  keys(): Promise<string[]>;
}

export function chromeKV(area: chrome.storage.StorageArea): KV {
  return {
    get: async (key) => (await area.get(key))[key],
    set: (key, value) => area.set({ [key]: value }),
    remove: (keys) => area.remove(keys),
    // Reads every value, so only quota eviction calls it.
    keys: async () => Object.keys(await area.get(null)),
  };
}
