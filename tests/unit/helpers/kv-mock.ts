/**
 * Lightweight in-memory KVNamespace mock for unit tests.
 * Simulates put/get/delete (ignores TTL enforcement — expiry is tested via Cloudflare infra).
 */
export class KVMock {
  private store: Map<string, string> = new Map();

  asKV(): KVNamespace {
    const store = this.store;
    return {
      put: (key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve();
      },
      get: (key: string) => {
        return Promise.resolve(store.get(key) ?? null) as ReturnType<KVNamespace['get']>;
      },
      delete: (key: string) => {
        store.delete(key);
        return Promise.resolve();
      },
      getWithMetadata: () => Promise.resolve({ value: null, metadata: null }),
      list: () => Promise.resolve({ keys: [], list_complete: true, cursor: '' }),
    } as unknown as KVNamespace;
  }
}
