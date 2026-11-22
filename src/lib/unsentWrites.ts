// A tiny device-local outbox for writes the Firestore SDK refused outright.
//
// Normally a write made offline is queued in Firestore's persistent cache and
// replayed on the next launch. After the SDK's fatal internal crash (see
// recoverIfSdkCrashed in firestore.ts) that queue is gone: setDoc/deleteDoc
// throw synchronously and nothing is stored. The app then auto-reloads, and
// the first snapshot after the reload no longer contains a meal added since
// the crash (so the store drops it) and still contains one deleted since the
// crash (so it comes back). This outbox remembers those writes so they can be
// replayed once the SDK is healthy again.
//
// localStorage, not the IndexedDB-persisted store: it is synchronous, so the
// record is safely on disk before the recovery reload ~300ms later.
//
// Only this device's own failed writes are recorded, so replaying them can
// never resurrect something another device deleted. Records hold personal
// data and are tied to the signed-in user; sign-out (and so account deletion)
// clears them.

import type { MealEntry, PantryItem } from '../types';

export type UnsentCollection = 'mealEntries' | 'pantryItems';

export type UnsentWrite = {
  uid: string;
  bistroId: string;
  collection: UnsentCollection;
  id: string;
  /** Distinguishes a record from a newer one for the same doc. */
  at: number;
} & ({ kind: 'set'; data: MealEntry | PantryItem } | { kind: 'delete' });

/** An UnsentWrite before it is stamped (Omit distributed over the union). */
export type NewUnsentWrite = UnsentWrite extends infer W ? (W extends UnsentWrite ? Omit<W, 'at'> : never) : never;

const KEY = 'bistro-unsent-writes';

export function readUnsentWrites(): UnsentWrite[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as UnsentWrite[]) : [];
  } catch {
    return [];
  }
}

function writeAll(records: UnsentWrite[]): void {
  try {
    if (records.length) localStorage.setItem(KEY, JSON.stringify(records));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked or full: nothing more we can do on this device.
  }
}

let _lastAt = 0;

/** Records a failed write. A newer write to the same doc replaces the older one. */
export function recordUnsentWrite(record: NewUnsentWrite): void {
  // Strictly increasing, so two records made in the same millisecond differ.
  const at = Math.max(Date.now(), _lastAt + 1);
  _lastAt = at;
  const rest = readUnsentWrites().filter(
    (r) => !(r.bistroId === record.bistroId && r.collection === record.collection && r.id === record.id),
  );
  writeAll([...rest, { ...record, at }]);
}

/** Forgets one record, unless a newer write to the same doc has replaced it. */
export function forgetUnsentWrite(record: UnsentWrite): void {
  writeAll(
    readUnsentWrites().filter(
      (r) =>
        !(
          r.bistroId === record.bistroId &&
          r.collection === record.collection &&
          r.id === record.id &&
          r.at === record.at
        ),
    ),
  );
}

export function clearUnsentWrites(): void {
  writeAll([]);
}
