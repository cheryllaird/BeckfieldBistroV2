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
import type { Recipe, MealEntry, ShoppingItem, PantryItem, SharedRecipe, CategoryOverride, CategoryOverrideLog, Bistro } from '../types';
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

/**
 * Resolves once every write queued before the call has been acknowledged by
 * the server — i.e. this device is up to date with it. Never settles while
 * offline. Deliberately does not wake the network itself: the connectivity
 * manager already forces a wake on the `online` event, and a second
 * enableNetwork alongside it is the stream-restart pressure that
 * ensureFirestoreOnline exists to avoid.
 */
export function waitForServerSync(): Promise<void> {
  if (!db) return Promise.resolve();
  return waitForPendingWrites(db).catch(() => {});
}

// ── data root ─────────────────────────────────────────────────────────────────
// A library lives at bistros/{bistroId}/…, and a user's own bistro id is their
// uid. Accounts created before bistros existed kept their library at
// users/{uid}/… until api/migrate-bistro.ts copies it across; because the ids
// match, the only difference between the two layouts is this root segment.
// The store flips it once the account's migration has completed (see
// setBistroMigrated in store/index.ts), and it is never flipped back.

let _root: 'users' | 'bistros' = 'users';

export function setDataRoot(migrated: boolean): void {
  _root = migrated ? 'bistros' : 'users';
}

const recipesCol = (bistroId: string) => collection(db!, _root, bistroId, 'recipes');
const mealEntriesCol = (bistroId: string) => collection(db!, _root, bistroId, 'mealEntries');
const shoppingItemsCol = (bistroId: string) => collection(db!, _root, bistroId, 'shoppingItems');
const pantryItemsCol = (bistroId: string) => collection(db!, _root, bistroId, 'pantryItems');
const categoryOverridesCol = (bistroId: string) => collection(db!, _root, bistroId, 'categoryOverrides');
/** Shared bistro settings (knownSources). */
const bistroProfileDoc = (bistroId: string) => doc(db!, _root, bistroId, 'meta', 'profile');
/** Personal, never shared: holds the encrypted Gemini key. */
const userProfileDoc = (uid: string) => doc(db!, 'users', uid, 'meta', 'profile');
const bistroAccessDoc = (uid: string) => doc(db!, 'users', uid, 'meta', 'bistroAccess');

// ── real-time subscription ────────────────────────────────────────────────────

export interface UserDataCallbacks {
  onRecipes: (recipes: Recipe[]) => void;
  onMealEntries: (entries: MealEntry[]) => void;
  onShoppingItems: (items: ShoppingItem[]) => void;
  onPantryItems: (items: PantryItem[]) => void;
  onCategoryOverrides: (overrides: CategoryOverride[]) => void;
  onKnownSources: (sources: string[]) => void;
  onHasGeminiApiKey: (hasKey: boolean) => void;
  /** The bistro to open on launch (null: whichever was open last). */
  onDefaultBistroId?: (bistroId: string | null) => void;
  onError?: (err: Error) => void;
}

/**
 * Subscribes to one bistro's data collections in real-time, plus the signed-in
 * user's own profile (for hasGeminiApiKey, which is personal even when viewing
 * someone else's bistro).
 * The first emission populates the store; subsequent emissions keep it live
 * across tabs, devices and bistro members.
 * Returns an unsubscribe function that tears down every listener.
 */
export function subscribeToUserData(
  bistroId: string,
  ownUid: string,
  callbacks: UserDataCallbacks,
): () => void {
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
    recipesCol(bistroId),
    (snap) => {
      if (skipIfCacheMiss(snap)) return;
      callbacks.onRecipes(snap.docs.map((d) => d.data() as Recipe));
    },
    handleError
  );

  const unsubMealEntries = onSnapshot(
    mealEntriesCol(bistroId),
    (snap) => {
      if (skipIfCacheMiss(snap)) return;
      callbacks.onMealEntries(snap.docs.map((d) => d.data() as MealEntry));
    },
    handleError
  );

  const unsubShoppingItems = onSnapshot(
    shoppingItemsCol(bistroId),
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
    pantryItemsCol(bistroId),
    (snap) => {
      if (skipIfCacheMiss(snap)) return;
      const items = snap.docs.map((d) => d.data() as PantryItem);
      items.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
      callbacks.onPantryItems(items);
    },
    handleError
  );

  const unsubCategoryOverrides = onSnapshot(
    categoryOverridesCol(bistroId),
    (snap) => {
      if (skipIfCacheMiss(snap)) return;
      callbacks.onCategoryOverrides(snap.docs.map((d) => d.data() as CategoryOverride));
    },
    handleError
  );

  const unsubProfile = onSnapshot(
    bistroProfileDoc(bistroId),
    (snap) => {
      if (snap.metadata.fromCache && !snap.exists()) return;
      callbacks.onKnownSources((snap.data()?.knownSources as string[]) ?? []);
    },
    handleError
  );

  const unsubUserProfile = onSnapshot(
    userProfileDoc(ownUid),
    (snap) => {
      if (snap.metadata.fromCache && !snap.exists()) return;
      callbacks.onHasGeminiApiKey(!!snap.data()?.geminiApiKeyEncrypted);
      callbacks.onDefaultBistroId?.((snap.data()?.defaultBistroId as string | undefined) ?? null);
    },
    handleError
  );

  return () => {
    unsubRecipes();
    unsubMealEntries();
    unsubShoppingItems();
    unsubPantryItems();
    unsubCategoryOverrides();
    unsubProfile();
    unsubUserProfile();
  };
}

// ── recipes ───────────────────────────────────────────────────────────────────

export function saveRecipe(bistroId: string, recipe: Recipe): Promise<void> {
  // Re-enable network in case the SDK got stuck in offline mode.
  ensureFirestoreOnline();

  const writePromise = setDoc(doc(recipesCol(bistroId), recipe.id), stripUndefined(recipe));
  // 5-second timeout: if the server hasn't acknowledged by then, the write is
  // safely queued in IndexedDB (persistentSingleTabManager) and will sync when
  // connectivity is restored. The caller should navigate away on this error.
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('SAVE_TIMEOUT')), 5_000)
  );
  return Promise.race([writePromise, timeout]);
}

export function deleteRecipeDoc(bistroId: string, id: string): void {
  ensureFirestoreOnline();
  deleteDoc(doc(recipesCol(bistroId), id)).catch(logFirestoreError);
}

// ── meal entries ──────────────────────────────────────────────────────────────

export function saveMealEntry(bistroId: string, entry: MealEntry): void {
  ensureFirestoreOnline();
  setDoc(doc(mealEntriesCol(bistroId), entry.id), stripUndefined(entry)).catch(logFirestoreError);
}

export function deleteMealEntryDoc(bistroId: string, id: string): void {
  ensureFirestoreOnline();
  deleteDoc(doc(mealEntriesCol(bistroId), id)).catch(logFirestoreError);
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
export function patchShoppingItems(bistroId: string, patches: ShoppingItemPatch[]): void {
  if (patches.length === 0) return;
  ensureFirestoreOnline();
  const col = shoppingItemsCol(bistroId);
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
export function deleteShoppingItemDoc(bistroId: string, id: string): void {
  ensureFirestoreOnline();
  deleteDoc(doc(shoppingItemsCol(bistroId), id)).catch(logFirestoreError);
}

// ── pantry items ──────────────────────────────────────────────────────────────

export function savePantryItem(bistroId: string, item: PantryItem): void {
  ensureFirestoreOnline();
  setDoc(doc(pantryItemsCol(bistroId), item.id), stripUndefined(item)).catch(logFirestoreError);
}

export function deletePantryItemDoc(bistroId: string, id: string): void {
  ensureFirestoreOnline();
  deleteDoc(doc(pantryItemsCol(bistroId), id)).catch(logFirestoreError);
}

export function savePantryItems(bistroId: string, items: PantryItem[]): void {
  ensureFirestoreOnline();
  const col = pantryItemsCol(bistroId);
  const batch = writeBatch(db!);
  items.forEach((item, index) =>
    batch.set(doc(col, item.id), stripUndefined({ ...item, order: index })),
  );
  batch.commit().catch(logFirestoreError);
}

// ── category overrides ────────────────────────────────────────────────────────

const categoryOverrideLogsCol = (bistroId: string) =>
  collection(db!, _root, bistroId, 'categoryOverrideLogs');

// Ingredient keys are free text ("rice noodle", "salt, flaky"); encode them so
// a "/" can't split the path and "__x__" can't hit Firestore's reserved ids.
const categoryOverrideDoc = (bistroId: string, ingredientKey: string) =>
  doc(categoryOverridesCol(bistroId), `k_${encodeURIComponent(ingredientKey)}`);

export function saveCategoryOverride(bistroId: string, override: CategoryOverride): void {
  ensureFirestoreOnline();
  setDoc(categoryOverrideDoc(bistroId, override.ingredientKey), override).catch(logFirestoreError);
}

export function deleteCategoryOverride(bistroId: string, ingredientKey: string): void {
  ensureFirestoreOnline();
  deleteDoc(categoryOverrideDoc(bistroId, ingredientKey)).catch(logFirestoreError);
}

export function logCategoryOverride(bistroId: string, entry: Omit<CategoryOverrideLog, 'id'>): void {
  ensureFirestoreOnline();
  addDoc(categoryOverrideLogsCol(bistroId), stripUndefined(entry)).catch(logFirestoreError);
}

// ── sources ───────────────────────────────────────────────────────────────────

export function saveKnownSources(bistroId: string, sources: string[]): void {
  ensureFirestoreOnline();
  setDoc(bistroProfileDoc(bistroId), { knownSources: sources }, { merge: true }).catch(logFirestoreError);
}

/** Personal preference: the bistro to open on launch, or null for the last one open. */
export function saveDefaultBistro(uid: string, bistroId: string | null): void {
  ensureFirestoreOnline();
  setDoc(userProfileDoc(uid), { defaultBistroId: bistroId ?? deleteField() }, { merge: true })
    .catch(logFirestoreError);
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

/** Saves a shared recipe into `bistroId` (the bistro being viewed), stamped as added by `uid`. */
export async function acceptShare(
  shareId: string,
  bistroId: string,
  uid: string,
  recipe: SharedRecipe['recipe']
): Promise<string> {
  const { generateId } = await import('./utils');
  const newId = generateId();
  const now = new Date().toISOString();
  const newRecipe: Recipe = {
    ...recipe,
    id: newId,
    userId: uid,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(recipesCol(bistroId), newId), stripUndefined(newRecipe));
  await deleteShare(shareId);
  return newId;
}

export async function dismissShare(shareId: string): Promise<void> {
  await deleteShare(shareId);
}

// ── bistros ───────────────────────────────────────────────────────────────────
// Membership is written only by /api/bistro (see src/lib/bistro.ts); the
// client just listens.

export interface BistroAccess {
  /** Bistros this user has been let into (their own is implicit). */
  bistroIds: string[];
  /** Their own library has been copied to bistros/{uid}/…. */
  migrated: boolean;
  /**
   * Served from the local cache, which can predate an invite accepted on
   * another device — so it can't be trusted to say a bistro has been lost.
   */
  fromCache?: boolean;
}

/**
 * Watches users/{uid}/meta/bistroAccess. `null` means the snapshot came from
 * an empty cache — nothing is known yet, so callers should keep what they have.
 */
export function subscribeToBistroAccess(
  uid: string,
  callback: (access: BistroAccess | null) => void,
): () => void {
  return onSnapshot(
    bistroAccessDoc(uid),
    (snap) => {
      if (snap.metadata.fromCache && !snap.exists()) return callback(null);
      const data = snap.data();
      callback({
        bistroIds: (data?.bistroIds as string[] | undefined) ?? [],
        migrated: !!data?.migratedAt,
        fromCache: snap.metadata.fromCache,
      });
    },
    (err) => {
      console.error('Bistro access subscription error:', err);
      recoverIfSdkCrashed(err);
    },
  );
}

/**
 * Watches one bistro's doc. Emits null when it doesn't exist (a user's own
 * bistro before it has been named or shared). `onError` fires with
 * permission-denied once the user is no longer a member.
 */
export function subscribeToBistro(
  bistroId: string,
  callback: (bistro: Bistro | null) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(
    doc(db!, 'bistros', bistroId),
    (snap) => {
      if (snap.metadata.fromCache && !snap.exists()) return;
      callback(snap.exists() ? ({ ...(snap.data() as Omit<Bistro, 'id'>), id: snap.id }) : null);
    },
    (err) => {
      recoverIfSdkCrashed(err);
      onError(err);
    },
  );
}
