import type { StateStorage } from 'zustand/middleware';

// IndexedDB-backed key/value storage for Zustand's persist middleware.
//
// We moved off localStorage because it caps at ~5MB: recipes embed base64 image
// data URLs (cover photos + full-res originals), and a library with enough
// photos overflowed the quota. The persist write runs synchronously inside every
// set() (e.g. a shopping-list toggle), so the overflow threw and aborted the
// action before the change reached storage or Firestore — making the whole store
// revert on the next refresh. IndexedDB has a far larger quota, so the full
// state (images included) can be persisted for a reliable offline library.
//
// A tiny hand-rolled wrapper avoids adding a dependency. getItem/setItem/
// removeItem are async; Zustand's persist supports async storage and the app
// already gates render on persist.hasHydrated()/onFinishHydration().

const DB_NAME = 'bistro-store';
const STORE_NAME = 'keyval';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function idbGet(key: string): Promise<string | null> {
  return getDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
        req.onerror = () => reject(req.error);
      }),
  );
}

function idbSet(key: string, value: string): Promise<void> {
  return getDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function idbDel(key: string): Promise<void> {
  return getDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

export const idbStorage: StateStorage = {
  getItem: async (name) => {
    try {
      const value = await idbGet(name);
      if (value != null) return value;
      // One-time migration: seed IndexedDB from the old localStorage-backed
      // persist (same key) so existing users keep their offline data, then drop
      // the legacy copy.
      const legacy = localStorage.getItem(name);
      if (legacy != null) {
        await idbSet(name, legacy).catch(() => {});
        localStorage.removeItem(name);
        return legacy;
      }
      return null;
    } catch (e) {
      console.error('IndexedDB read failed, falling back to localStorage:', e);
      return localStorage.getItem(name);
    }
  },
  setItem: async (name, value) => {
    try {
      await idbSet(name, value);
    } catch (e) {
      // Never let a persist write throw out of a store action; the change stays
      // live in memory and in Firestore regardless.
      console.error('Persist write failed (IndexedDB):', e);
    }
  },
  removeItem: async (name) => {
    try {
      await idbDel(name);
    } catch (e) {
      console.error('IndexedDB delete failed:', e);
    }
    localStorage.removeItem(name);
  },
};
