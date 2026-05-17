import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  writeBatch,
  getDocs,
  addDoc,
  enableNetwork,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import type { Recipe, MealEntry, ShoppingItem, PantryItem, SharedRecipe, CategoryOverrideLog } from '../types';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Firestore rejects documents with `undefined` field values. Strip them out. */
function stripUndefined<T extends object>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
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
  onError?: (err: Error) => void;
  /** Called once after the first recipes snapshot resolves (data, cache-miss, or error). */
  onDataReady?: () => void;
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
    callbacks.onError?.(err);
  };

  // Guard: skip an empty cache-miss snapshot so it doesn't overwrite data
  // already restored from localStorage. Firebase fires onSnapshot immediately
  // with an empty result when offline and the collection has no local cache;
  // without this guard that wipes the persisted store state.
  const skipIfCacheMiss = (snap: { empty: boolean; metadata: { fromCache: boolean } }) =>
    snap.metadata.fromCache && snap.empty;

  let recipesFirstEmission = false;
  const unsubRecipes = onSnapshot(
    recipesCol(uid),
    (snap) => {
      if (!recipesFirstEmission) {
        recipesFirstEmission = true;
        callbacks.onDataReady?.();
      }
      if (skipIfCacheMiss(snap)) return;
      callbacks.onRecipes(snap.docs.map((d) => d.data() as Recipe));
    },
    (err) => {
      if (!recipesFirstEmission) {
        recipesFirstEmission = true;
        callbacks.onDataReady?.();
      }
      handleError(err);
    }
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
      const items = snap.docs.map((d) => d.data() as ShoppingItem);
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
      // Same guard for the profile doc: don't wipe knownSources when the doc
      // simply isn't in the local cache yet.
      if (snap.metadata.fromCache && !snap.exists()) return;
      callbacks.onKnownSources((snap.data()?.knownSources as string[]) ?? []);
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
  enableNetwork(db!).catch(() => {});

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
  deleteDoc(doc(recipesCol(uid), id)).catch(console.error);
}

// ── meal entries ──────────────────────────────────────────────────────────────

export function saveMealEntry(uid: string, entry: MealEntry): void {
  setDoc(doc(mealEntriesCol(uid), entry.id), stripUndefined(entry)).catch(console.error);
}

export function deleteMealEntryDoc(uid: string, id: string): void {
  deleteDoc(doc(mealEntriesCol(uid), id)).catch(console.error);
}

// ── shopping items ────────────────────────────────────────────────────────────

export function saveShoppingItem(uid: string, item: ShoppingItem): void {
  setDoc(doc(shoppingItemsCol(uid), item.id), stripUndefined(item)).catch(console.error);
}

export function deleteShoppingItemDoc(uid: string, id: string): void {
  deleteDoc(doc(shoppingItemsCol(uid), id)).catch(console.error);
}

/** Batch replace the entire shopping list (used for setShoppingItems / reorder). */
export async function saveShoppingItems(uid: string, items: ShoppingItem[]): Promise<void> {
  const col = shoppingItemsCol(uid);

  // Delete all existing docs first
  const existing = await getDocs(col);
  const batch = writeBatch(db!);
  existing.docs.forEach((d) => batch.delete(d.ref));
  items.forEach((item, index) => batch.set(doc(col, item.id), stripUndefined({ ...item, order: index })));
  batch.commit().catch(console.error);
}

// ── pantry items ──────────────────────────────────────────────────────────────

export function savePantryItem(uid: string, item: PantryItem): void {
  setDoc(doc(pantryItemsCol(uid), item.id), stripUndefined(item)).catch(console.error);
}

export function deletePantryItemDoc(uid: string, id: string): void {
  deleteDoc(doc(pantryItemsCol(uid), id)).catch(console.error);
}

export async function savePantryItems(uid: string, items: PantryItem[]): Promise<void> {
  const col = pantryItemsCol(uid);
  const existing = await getDocs(col);
  const batch = writeBatch(db!);
  existing.docs.forEach((d) => batch.delete(d.ref));
  items.forEach((item, index) => batch.set(doc(col, item.id), stripUndefined({ ...item, order: index })));
  batch.commit().catch(console.error);
}

// ── category override log ─────────────────────────────────────────────────────

const categoryOverrideLogsCol = (uid: string) =>
  collection(db!, 'users', uid, 'categoryOverrideLogs');

export function logCategoryOverride(uid: string, entry: Omit<CategoryOverrideLog, 'id'>): void {
  addDoc(categoryOverrideLogsCol(uid), stripUndefined(entry)).catch(console.error);
}

// ── sources ───────────────────────────────────────────────────────────────────

export function saveKnownSources(uid: string, sources: string[]): void {
  setDoc(profileDoc(uid), { knownSources: sources }, { merge: true }).catch(console.error);
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
