// In-memory stand-in for lib/idbStorage, picked up by
// `vi.mock('.../lib/idbStorage')`, so the persisted store runs without IndexedDB.
const data = new Map<string, string>();

export const idbStorage = {
  getItem: async (key: string) => data.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    data.set(key, value);
  },
  removeItem: async (key: string) => {
    data.delete(key);
  },
};
