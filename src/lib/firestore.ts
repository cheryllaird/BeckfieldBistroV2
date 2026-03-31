import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Recipe, MealEntry, ShoppingItem } from '../types';

// ── helpers ──────────────────────────────────────────────────────────────────

const recipesCol = (uid: string) => collection(db!, 'users', uid, 'recipes');
const mealEntriesCol = (uid: string) => collection(db!, 'users', uid, 'mealEntries');
const shoppingItemsCol = (uid: string) => collection(db!, 'users', uid, 'shoppingItems');
const profileDoc = (uid: string) => doc(db!, 'users', uid, 'meta', 'profile');

// ── load all user data at sign-in ─────────────────────────────────────────────

export async function loadUserData(uid: string): Promise<{
  recipes: Recipe[];
  mealEntries: MealEntry[];
  shoppingItems: ShoppingItem[];
  knownSources: string[];
}> {
  const [recipesSnap, mealEntriesSnap, shoppingItemsSnap, profileSnap] = await Promise.all([
    getDocs(recipesCol(uid)),
    getDocs(mealEntriesCol(uid)),
    getDocs(shoppingItemsCol(uid)),
    getDocs(collection(db!, 'users', uid, 'meta')),
  ]);

  const recipes = recipesSnap.docs.map((d) => d.data() as Recipe);
  const mealEntries = mealEntriesSnap.docs.map((d) => d.data() as MealEntry);
  const shoppingItems = shoppingItemsSnap.docs.map((d) => d.data() as ShoppingItem);

  const profileData = profileSnap.docs.find((d) => d.id === 'profile')?.data();
  const knownSources: string[] = profileData?.knownSources ?? [];

  return { recipes, mealEntries, shoppingItems, knownSources };
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
