declare namespace chrome {
  namespace runtime {
    const id: string | undefined;
    function getURL(path: string): string;
  }
  namespace storage {
    interface StorageArea {
      get(keys: string | string[] | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    }
    const local: StorageArea;
  }
}
