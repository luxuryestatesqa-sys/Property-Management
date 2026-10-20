// A tiny per-instance cache whose entries expire after `ttlMs`. For answers that many people ask for
// within seconds of each other (every request's user check, the dashboard, a portal's feed), where being
// a few seconds old doesn't matter. Each running copy of the app has its own; nothing is shared.
export function ttlCache<V>(ttlMs: number, maxEntries = 2000) {
  const store = new Map<string, { value: V; expires: number }>();
  return {
    get(key: string): V | undefined {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (hit.expires <= Date.now()) {
        store.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key: string, value: V) {
      if (store.size >= maxEntries) {
        const now = Date.now();
        for (const [k, v] of store) if (v.expires <= now) store.delete(k);
        if (store.size >= maxEntries) store.delete(store.keys().next().value as string);
      }
      store.set(key, { value, expires: Date.now() + ttlMs });
    },
    delete(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}
