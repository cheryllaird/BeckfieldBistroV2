import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  deleteField,
  writeBatch,
  addDoc,
  enableNetwork,
  waitForPendingWrites,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import type { Recipe, MealEntry, ShoppingItem, PantryItem, SharedRecipe, CategoryOverrideLog } from '../types';
import type { ShoppingItemPatch } from './shoppingSync';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Firestore rejects documents with `undefined` field values. Strip them out. */
function stripUndefined<T extends object>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// ── SDK crash recovery ────────────────────────────────────────────────────────

let _recoveryTriggered = false;

/**
 * Detects a fatal Firestore SDK crash and restarts the app to recover.
 *
 * When the SDK hits an internal invariant violation ("INTERNAL ASSERTION
 * FAILED", e.g. the watch-stream race in firebase-js-sdk#9267), its async
 * queue shuts down permanently: every subsequent read, write and listener
 * fails until the page is reloaded. Left alone, that looks like "sync
 * silently stopped working until I force-closed the app". A reload is safe —
 * queued writes are durable in Firestore's IndexedDB cache and replay on
 * relaunch, and the Zustand store is persisted — so recover automatically.
 *
 * Guarded to fire at most once per page life and once per 5 minutes per tab,
 * so a crash the reload doesn't cure can never cause a reload loop.
 */
export function recoverIfSdkCrashed(err: unknown): void {
  const text =
    err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err ?? '');
  if (!text.includes('INTERNAL ASSERTION FAILED')) return;
  if (_recoveryTriggered) return;
  _recoveryTriggered = true;
  try {
    const key = 'bistro-firestore-recovery-at';
    const last = Number(sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last < 5 * 60_000) return;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    // sessionStorage unavailable — _recoveryTriggered still limits this page
    // to a single reload attempt.
  }
  console.error('Firestore SDK crashed with an internal assertion; reloading to recover.', err);
  // Give the error log a beat to flush, then restart the app.
  setTimeout(() => window.location.reload(), 300);
}

/** console.error plus fatal-crash detection — used by every write path. */
function logFirestoreError(err: unknown): void {
  console.error(err);
  recoverIfSdkCrashed(err);
}

// How long an enableNetwork() call suppresses the next one. See
// ensureFirestoreOnline for why throttling matters.
const ENABLE_NETWORK_THROTTLE_MS = 10_000;
let _lastEnableNetworkAt = 0;

/**
 * Forces the Firestore SDK back online, throttled.
 *
 * On mobile PWAs the realtime connection goes dormant whenever the app is
 * backgrounded (screen locked / tab hidden) and does not always re-establish on
 * its own — the "SDK stuck offline" behaviour seen in production here. While
 * dormant the onSnapshot listeners stop receiving server pushes and queued
 * writes never reach the server, so an edit made on one device never appears on
 * another. Calling enableNetwork wakes the connection back up, so we invoke it
 * whenever cross-device sync is expected to resume.
 *
 * BUT enableNetwork is not free: each call can force the watch stream to
 * restart, and a restart mid-flight is exactly what drives Firestore's fatal
 * "INTERNAL ASSERTION FAILED (ID: ca9), pendingResponses < 0" crash
 * (firebase-js-sdk#9267 / #8250) — the watch aggregator receives more target
 * acks than it recorded requests for. This app used to call enableNetwork from
 * every write path and every focus/visibility/online event, so two devices
 * actively editing the shopping list produced a storm of enableNetwork calls —
 * a continuous stream-restart pressure that made the race fire routinely.
 *
 * So collapse the storm: fire at most once per throttle window. The leading
 * edge still fires immediately (the first write in a burst, or a resume after
 * an idle period wakes the SDK right away); the rapid follow-ups that used to
 * churn the stream are dropped. `force` bypasses the throttle for genuine
 * resume transitions (app foregrounded / network restored), which are
 * infrequent and are precisely when a dormant SDK must be re-woken.
 */
export function ensureFirestoreOnline(force = false): void {
  if (!db) return;
  const now = Date.now();
  if (!force && now - _lastEnableNetworkAt < ENABLE_NETWORK_THROTTLE_MS) return;
  _lastEnableNetworkAt = now;
  enableNetwork(db).catch(() => {});
}

/**
 * Best-effort flush of locally-queued writes to the server, called when the app
 * is about to be hidden/closed (see connectivity.ts).
 *
 * Writes are always durably queued in IndexedDB by persistentLocalCache before
 * the SDK round-trips, so nothing is lost if the app dies — the queue replays on
 * the next launch. But that means a change made on this device only reaches the
 * server (and therefore other devices) once this app is reopened. Nudging the
 * network on the way out gives the SDK a chance to drain the queue while the
 * page is still alive, so the common "tick an item then swipe the app away" case
 * propagates immediately instead of waiting for the next cold start.
 *
 * This is best-effort by nature: the browser may suspend or kill the page before
 * the flush completes (page-unload work cannot be awaited reliably), in which
 * case the durable queue + next-launch replay remains the backstop. enableNetwork
 * is fire-and-forget; waitForPendingWrites is only used to know when the drain
 * finished for callers that can act on it.
 */
export function flushPendingWrites(): Promise<void> {
  if (!db) return Promise.resolve();
  // Throttled wake (shared budget with writes), so rapid tab-flipping can't
  // turn the hide handler into another enableNetwork storm. waitForPendingWrites
  // still drains the queue regardless of whether the wake actually fired.
  ensureFirestoreOnline();
  return waitForPendingWrites(db).catch(() => {});
}

const recipesCol = (uid: string) => collection(db!, 'users', uid, 'recipes');
const mealEntriesCol = (uid: string) => collection(db!, 'users', uid, 'mealEntries');
const shoppingItemsCol = (uid: string) => collection(db!, 'users', uid, 'shoppingItems');
const pantryItemsCol = (uid: string) => collection(db!, 'users', uid, 'pantryItems');
const profileDoc = (uid: string) => doc(db!, 'users', uid, 'meta', 'profile');

// ── real-time subscription ────────────────────────────────────────────────────

export interface UserDataCallbacks {
  onRecipes: (recipes: Recipe[]) => void;
  onMealEntries: (entries: MealEntry[]) => void;
  onShoppingItems: (items: ShoppingItem[]) => void;
  onPantryItems: (items: PantryItem[]) => void;
  onKnownSources: (sources: string[]) => void;
  onHasGeminiApiKey: (hasKey: boolean) => void;
  onError?: (err: Error) => void;
}

/**
 * Subscribes to all user data collections in real-time.
 * The first emission populates the store; subsequent emissions keep it live
 * across tabs and devices.
 * Returns an unsubscribe function that tears down all four listeners.
 */
export function subscribeToUserData(uid: string, callbacks: UserDataCallbacks): () => void {
  const handleError = (err: Error) => {
    console.error('Firestore subscription error:', err);
    recoverIfSdkCrashed(err);
    callbacks.onError?.(err);
  };

  // Guard: skip an empty cache-miss snapshot so it doesn't overwrite data
  // already restored from localStorage. Firebase fires onSnapshot immediately
  // with an empty result when offline and the collection has no local cache;
  // without this guard that wipes the persisted store state.
  const skipIfCacheMiss = (snap: { empty: boolean; metadata: { fromCache: boolean } }) =>
    snap.metadata.fromCache && snap.empty;

  const unsubRecipes = onSnapshot(
    recipesCol(uid),
    (snap) => {
      if (skipIfCacheMiss(snap)) return;
      callbacks.onRecipes(snap.docs.map((d) => d.data() as Recipe));
    },
    handleError
  );

  const unsubMealEntries = onSnapshot(
    mealEntriesCol(uid),
    (snap) => {
      if (skipIfCacheMiss(snap)) return;
      callbacks.onMealEntries(snap.docs.map((d) => d.data() as MealEntry));
    },
    handleError
  );

  const unsubShoppingItems = onSnapshot(
    shoppingItemsCol(uid),
    (snap) => {
      if (skipIfCacheMiss(snap)) return;
      // Raw docs, tombstoned (soft-deleted) ones included — the store's
      // reconcile needs to see deletions explicitly (see shoppingSync.ts).
      // `id` MUST come from the document path (d.id), not d.data(): the
      // field-masked patch writer intentionally does not store `id` inside the
      // document, so d.data() carries no id. Reading it from the path is both
      // correct and the authoritative source (the path id is what every write
      // targets). Without this, every item reads back with id === undefined,
      // which breaks all id-based reconciliation — items fail to match their
      // local copy and get duplicated, and re-writing them calls doc() with an
      // empty path.
      const items = snap.docs.map((d) => ({ ...(d.data() as ShoppingItem), id: d.id }));
      items.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
      callbacks.onShoppingItems(items);
    },
    handleError
  );

  const unsubPantryItems = onSnapshot(
    pantryItemsCol(uid),
    (snap) => {
      if (skipIfCacheMiss(snap)) return;
      const items = snap.docs.map((d) => d.data() as PantryItem);
      items.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
      callbacks.onPantryItems(items);
    },
    handleError
  );

  const unsubProfile = onSnapshot(
    profileDoc(uid),
    (snap) => {
      if (snap.metadata.fromCache && !snap.exists()) return;
      callbacks.onKnownSources((snap.data()?.knownSources as string[]) ?? []);
      callbacks.onHasGeminiApiKey(!!snap.data()?.geminiApiKeyEncrypted);
    },
    handleError
  );

  return () => {
    unsubRecipes();
    unsubMealEntries();
    unsubShoppingItems();
    unsubPantryItems();
    unsubProfile();
  };
}

// ── recipes ───────────────────────────────────────────────────────────────────

export function saveRecipe(uid: string, recipe: Recipe): Promise<void> {
  // Re-enable network in case the SDK got stuck in offline mode.
  ensureFirestoreOnline();

  const writePromise = setDoc(doc(recipesCol(uid), recipe.id), stripUndefined(recipe));
  // 5-second timeout: if the server hasn't acknowledged by then, the write is
  // safely queued in IndexedDB (persistentSingleTabManager) and will sync when
  // connectivity is restored. The caller should navigate away on this error.
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('SAVE_TIMEOUT')), 5_000)
  );
  return Promise.race([writePromise, timeout]);
}

export function deleteRecipeDoc(uid: string, id: string): void {
  ensureFirestoreOnline();
  deleteDoc(doc(recipesCol(uid), id)).catch(logFirestoreError);
}

// ── meal entries ──────────────────────────────────────────────────────────────

export function saveMealEntry(uid: string, entry: MealEntry): void {
  ensureFirestoreOnline();
  setDoc(doc(mealEntriesCol(uid), entry.id), stripUndefined(entry)).catch(logFirestoreError);
}

export function deleteMealEntryDoc(uid: string, id: string): void {
  ensureFirestoreOnline();
  deleteDoc(doc(mealEntriesCol(uid), id)).catch(logFirestoreError);
}

// ── shopping items ────────────────────────────────────────────────────────────

/**
 * Applies field-masked patches (see shoppingSync.ts) as merge writes, so each
 * device only ever touches the fields it actually changed. This is what makes
 * offline queues safe: a replayed stale patch can no longer overwrite fields
 * another device edited in the meantime, and a patch merging into a
 * tombstoned doc can't resurrect it. `null` field values clear the field on
 * the server (the winning copy doesn't carry it); `undefined` fields are
 * omitted from the write entirely.
 */
export function patchShoppingItems(uid: string, patches: ShoppingItemPatch[]): void {
  if (patches.length === 0) return;
  ensureFirestoreOnline();
  const col = shoppingItemsCol(uid);
  // Firestore batches cap at 500 operations; chunk to stay under it.
  for (let i = 0; i < patches.length; i += 450) {
    const batch = writeBatch(db!);
    let wrote = false;
    for (const { id, ...fields } of patches.slice(i, i + 450)) {
      // Never call doc() with an empty path — it throws synchronously and
      // would abort the whole batch. A falsy id can only come from corrupted
      // local state (see the id: d.id fix above); skip it defensively.
      if (!id) continue;
      const data: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (value === undefined) continue;
        data[key] = value === null ? deleteField() : value;
      }
      batch.set(doc(col, id), data, { merge: true });
      wrote = true;
    }
    if (wrote) batch.commit().catch(logFirestoreError);
  }
}

/** Hard delete — only used to purge tombstones past their retention window. */
export function deleteShoppingItemDoc(uid: string, id: string): void {
  ensureFirestoreOnline();
  deleteDoc(doc(shoppingItemsCol(uid), id)).catch(logFirestoreError);
}

// ── pantry items ──────────────────────────────────────────────────────────────

export function savePantryItem(uid: string, item: PantryItem): void {
  ensureFirestoreOnline();
  setDoc(doc(pantryItemsCol(uid), item.id), stripUndefined(item)).catch(logFirestoreError);
}

export function deletePantryItemDoc(uid: string, id: string): void {
  ensureFirestoreOnline();
  deleteDoc(doc(pantryItemsCol(uid), id)).catch(logFirestoreError);
}

export function savePantryItems(uid: string, items: PantryItem[]): void {
  ensureFirestoreOnline();
  const col = pantryItemsCol(uid);
  const batch = writeBatch(db!);
  items.forEach((item, index) =>
    batch.set(doc(col, item.id), stripUndefined({ ...item, order: index })),
  );
  batch.commit().catch(logFirestoreError);
}

// ── category override log ─────────────────────────────────────────────────────

const categoryOverrideLogsCol = (uid: string) =>
  collection(db!, 'users', uid, 'categoryOverrideLogs');

export function logCategoryOverride(uid: string, entry: Omit<CategoryOverrideLog, 'id'>): void {
  ensureFirestoreOnline();
  addDoc(categoryOverrideLogsCol(uid), stripUndefined(entry)).catch(logFirestoreError);
}

// ── sources ───────────────────────────────────────────────────────────────────

export function saveKnownSources(uid: string, sources: string[]): void {
  ensureFirestoreOnline();
  setDoc(profileDoc(uid), { knownSources: sources }, { merge: true }).catch(logFirestoreError);
}

// ── AI API key ────────────────────────────────────────────────────────────────
// Each user supplies their own Gemini API key so recipe-extraction usage/cost is
// billed to their own account rather than a single shared key. The key itself
// never touches the client SDK's direct Firestore writes — it's sent once,
// over HTTPS, to /api/save-gemini-key, which encrypts it server-side before
// storing it. Firestore (and this client) only ever sees the ciphertext.

export async function saveGeminiApiKey(apiKey: string): Promise<boolean> {
  if (!auth?.currentUser) throw new Error('Not authenticated');
  const token = await auth.currentUser.getIdToken();
  const res = await fetch('/api/save-gemini-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ apiKey }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? 'Failed to save API key');
  }
  return ((await res.json()) as { hasKey: boolean }).hasKey;
}

// ── recipe sharing ────────────────────────────────────────────────────────────
// All sharedRecipes writes go through /api/share-recipe (firebase-admin) so
// that the feature works without having to deploy Firestore security rules for
// the top-level sharedRecipes collection.

async function sharingToken(): Promise<string> {
  if (!auth?.currentUser) throw new Error('Not authenticated');
  return auth.currentUser.getIdToken();
}

export async function sendRecipeShare(share: Omit<SharedRecipe, 'id'>): Promise<string> {
  const token = await sharingToken();
  const res = await fetch('/api/share-recipe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(share),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? 'Failed to send');
  }
  return ((await res.json()) as { id: string }).id;
}

export function subscribeToIncomingShares(
  _email: string,
  callback: (shares: SharedRecipe[]) => void
): () => void {
  if (!auth?.currentUser) return () => {};
  let cancelled = false;
  auth.currentUser.getIdToken()
    .then((token) => fetch('/api/share-recipe', { headers: { Authorization: `Bearer ${token}` } }))
    .then((r) => (r.ok ? r.json() : { shares: [] }) as Promise<{ shares: SharedRecipe[] }>)
    .then((data) => { if (!cancelled) callback(data.shares ?? []); })
    .catch(() => { if (!cancelled) callback([]); });
  return () => { cancelled = true; };
}

async function deleteShare(shareId: string): Promise<void> {
  const token = await sharingToken();
  await fetch(`/api/share-recipe?id=${encodeURIComponent(shareId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function acceptShare(
  shareId: string,
  toUid: string,
  recipe: SharedRecipe['recipe']
): Promise<string> {
  const { generateId } = await import('./utils');
  const newId = generateId();
  const now = new Date().toISOString();
  const newRecipe: Recipe = {
    ...recipe,
    id: newId,
    userId: toUid,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(recipesCol(toUid), newId), stripUndefined(newRecipe));
  await deleteShare(shareId);
  return newId;
}

export async function dismissShare(shareId: string): Promise<void> {
  await deleteShare(shareId);
}
