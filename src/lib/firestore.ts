import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  writeBatch,
  getDocs,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Recipe, MealEntry, ShoppingItem } from '../types';

// ── helpers ──────────────────────────────────────────────────────────────────

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
    (snap) => callbacks.onShoppingItems(snap.docs.map((d) => d.data() as ShoppingItem)),
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

export function saveRecipe(uid: string, recipe: Recipe): void {
  setDoc(doc(recipesCol(uid), recipe.id), recipe).catch(console.error);
}

export function deleteRecipeDoc(uid: string, id: string): void {
  deleteDoc(doc(recipesCol(uid), id)).catch(console.error);
}

// ── meal entries ──────────────────────────────────────────────────────────────

export function saveMealEntry(uid: string, entry: MealEntry): void {
  setDoc(doc(mealEntriesCol(uid), entry.id), entry).catch(console.error);
}

export function deleteMealEntryDoc(uid: string, id: string): void {
  deleteDoc(doc(mealEntriesCol(uid), id)).catch(console.error);
}

// ── shopping items ────────────────────────────────────────────────────────────

export function saveShoppingItem(uid: string, item: ShoppingItem): void {
  setDoc(doc(shoppingItemsCol(uid), item.id), item).catch(console.error);
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
  items.forEach((item) => batch.set(doc(col, item.id), item));
  batch.commit().catch(console.error);
}

// ── sources ───────────────────────────────────────────────────────────────────

export function saveKnownSources(uid: string, sources: string[]): void {
  setDoc(profileDoc(uid), { knownSources: sources }, { merge: true }).catch(console.error);
}
