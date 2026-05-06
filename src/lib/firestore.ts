import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  writeBatch,
  getDocs,
  addDoc,
  query,
  where,
  enableNetwork,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Recipe, MealEntry, ShoppingItem, SharedRecipe, CategoryOverrideLog } from '../types';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Firestore rejects documents with `undefined` field values. Strip them out. */
function stripUndefined<T extends object>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

const recipesCol = (uid: string) => collection(db!, 'users', uid, 'recipes');
const mealEntriesCol = (uid: string) => collection(db!, 'users', uid, 'mealEntries');
const shoppingItemsCol = (uid: string) => collection(db!, 'users', uid, 'shoppingItems');
const profileDoc = (uid: string) => doc(db!, 'users', uid, 'meta', 'profile');

// ── real-time subscription ────────────────────────────────────────────────────

export interface UserDataCallbacks {
  onRecipes: (recipes: Recipe[]) => void;
  onMealEntries: (entries: MealEntry[]) => void;
  onShoppingItems: (items: ShoppingItem[]) => void;
  onKnownSources: (sources: string[]) => void;
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
    callbacks.onError?.(err);
  };

  const unsubRecipes = onSnapshot(
    recipesCol(uid),
    (snap) => callbacks.onRecipes(snap.docs.map((d) => d.data() as Recipe)),
    handleError
  );

  const unsubMealEntries = onSnapshot(
    mealEntriesCol(uid),
    (snap) => callbacks.onMealEntries(snap.docs.map((d) => d.data() as MealEntry)),
    handleError
  );

  const unsubShoppingItems = onSnapshot(
    shoppingItemsCol(uid),
    (snap) => {
      const items = snap.docs.map((d) => d.data() as ShoppingItem);
      items.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
      callbacks.onShoppingItems(items);
    },
    handleError
  );

  const unsubProfile = onSnapshot(
    profileDoc(uid),
    (snap) => callbacks.onKnownSources((snap.data()?.knownSources as string[]) ?? []),
    handleError
  );

  return () => {
    unsubRecipes();
    unsubMealEntries();
    unsubShoppingItems();
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

const sharedRecipesCol = () => collection(db!, 'sharedRecipes');

export async function sendRecipeShare(share: Omit<SharedRecipe, 'id'>): Promise<string> {
  const ref = await addDoc(sharedRecipesCol(), stripUndefined(share));
  return ref.id;
}

export function subscribeToIncomingShares(
  email: string,
  callback: (shares: SharedRecipe[]) => void
): () => void {
  const q = query(sharedRecipesCol(), where('toEmail', '==', email));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SharedRecipe))),
    console.error
  );
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
  await deleteDoc(doc(sharedRecipesCol(), shareId));
  return newId;
}

export async function dismissShare(shareId: string): Promise<void> {
  await deleteDoc(doc(sharedRecipesCol(), shareId));
}
