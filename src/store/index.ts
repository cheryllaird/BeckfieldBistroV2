import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { signOut as firebaseSignOut } from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import { auth } from '../lib/firebase';
import {
  loadUserData,
  saveRecipe,
  deleteRecipeDoc,
  saveMealEntry,
  deleteMealEntryDoc,
  saveShoppingItem,
  saveShoppingItems,
  deleteShoppingItemDoc,
  saveKnownSources,
} from '../lib/firestore';
import type { Recipe, MealEntry, ShoppingItem, AppState } from '../types';

interface Store extends AppState {
  // Recipe actions
  addRecipe: (recipe: Omit<Recipe, 'userId'>) => void;
  updateRecipe: (recipe: Recipe) => void;
  deleteRecipe: (id: string) => void;

  // Meal plan actions
  addMealEntry: (entry: MealEntry) => void;
  updateMealEntry: (entry: MealEntry) => void;
  deleteMealEntry: (id: string) => void;

  // Shopping list actions
  setShoppingItems: (items: ShoppingItem[]) => void;
  toggleShoppingItem: (id: string) => void;
  addShoppingItem: (item: ShoppingItem) => void;
  removeShoppingItem: (id: string) => void;
  reorderShoppingItems: (items: ShoppingItem[]) => void;
  clearCheckedItems: () => void;

  // Auth actions
  signIn: (firebaseUser: FirebaseUser) => void;
  signOut: () => Promise<void>;
  setSplashDone: () => void;

  // Source actions
  addSource: (source: string) => void;
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      recipes: [],
      mealEntries: [],
      shoppingItems: [],
      knownSources: [],
      isAuthenticated: false,
      user: null,
      splashDone: false,

      addRecipe: (recipe) => {
        const uid = get().user?.uid ?? '';
        const recipeWithUser: Recipe = { ...recipe, userId: uid };
        set((s) => ({
          recipes: [recipeWithUser, ...s.recipes],
          knownSources: s.knownSources.includes(recipeWithUser.source)
            ? s.knownSources
            : [...s.knownSources, recipeWithUser.source],
        }));
        if (uid) {
          saveRecipe(uid, recipeWithUser);
          saveKnownSources(uid, get().knownSources);
        }
      },

      updateRecipe: (recipe) => {
        set((s) => ({ recipes: s.recipes.map((r) => (r.id === recipe.id ? recipe : r)) }));
        const uid = get().user?.uid;
        if (uid) saveRecipe(uid, recipe);
      },

      deleteRecipe: (id) => {
        set((s) => ({ recipes: s.recipes.filter((r) => r.id !== id) }));
        const uid = get().user?.uid;
        if (uid) deleteRecipeDoc(uid, id);
      },

      addMealEntry: (entry) => {
        set((s) => ({ mealEntries: [...s.mealEntries, entry] }));
        const uid = get().user?.uid;
        if (uid) saveMealEntry(uid, entry);
      },

      updateMealEntry: (entry) => {
        set((s) => ({
          mealEntries: s.mealEntries.map((e) => (e.id === entry.id ? entry : e)),
        }));
        const uid = get().user?.uid;
        if (uid) saveMealEntry(uid, entry);
      },

      deleteMealEntry: (id) => {
        set((s) => ({ mealEntries: s.mealEntries.filter((e) => e.id !== id) }));
        const uid = get().user?.uid;
        if (uid) deleteMealEntryDoc(uid, id);
      },

      setShoppingItems: (items) => {
        set({ shoppingItems: items });
        const uid = get().user?.uid;
        if (uid) saveShoppingItems(uid, items);
      },

      toggleShoppingItem: (id) => {
        set((s) => ({
          shoppingItems: s.shoppingItems.map((item) =>
            item.id === id ? { ...item, checked: !item.checked } : item
          ),
        }));
        const uid = get().user?.uid;
        if (uid) {
          const item = get().shoppingItems.find((i) => i.id === id);
          if (item) saveShoppingItem(uid, item);
        }
      },

      addShoppingItem: (item) => {
        set((s) => ({ shoppingItems: [...s.shoppingItems, item] }));
        const uid = get().user?.uid;
        if (uid) saveShoppingItem(uid, item);
      },

      removeShoppingItem: (id) => {
        set((s) => ({ shoppingItems: s.shoppingItems.filter((i) => i.id !== id) }));
        const uid = get().user?.uid;
        if (uid) deleteShoppingItemDoc(uid, id);
      },

      reorderShoppingItems: (items) => {
        set({ shoppingItems: items });
        const uid = get().user?.uid;
        if (uid) saveShoppingItems(uid, items);
      },

      clearCheckedItems: () => {
        const removed = get().shoppingItems.filter((i) => i.checked);
        set((s) => ({ shoppingItems: s.shoppingItems.filter((i) => !i.checked) }));
        const uid = get().user?.uid;
        if (uid) removed.forEach((i) => deleteShoppingItemDoc(uid, i.id));
      },

      signIn: (firebaseUser) => {
        // Authenticate immediately so the app opens at once — data loads in the background.
        // Awaiting Firestore before setting isAuthenticated caused the app to stay on the
        // login page whenever Firestore was slow or unavailable.
        set({
          isAuthenticated: true,
          user: {
            uid: firebaseUser.uid,
            name: firebaseUser.displayName ?? 'User',
            email: firebaseUser.email ?? '',
            avatar: firebaseUser.photoURL ?? undefined,
          },
          recipes: [],
          mealEntries: [],
          shoppingItems: [],
          knownSources: [],
        });
        loadUserData(firebaseUser.uid)
          .then((data) => set({
            recipes: data.recipes,
            mealEntries: data.mealEntries,
            shoppingItems: data.shoppingItems,
            knownSources: data.knownSources,
          }))
          .catch((e) => console.error('Failed to load user data from Firestore:', e));
      },

      signOut: async () => {
        if (auth) await firebaseSignOut(auth);
        set({
          isAuthenticated: false,
          user: null,
          recipes: [],
          mealEntries: [],
          shoppingItems: [],
          knownSources: [],
        });
      },

      setSplashDone: () => set({ splashDone: true }),

      addSource: (source) => {
        set((s) => ({
          knownSources: s.knownSources.includes(source)
            ? s.knownSources
            : [...s.knownSources, source],
        }));
        const uid = get().user?.uid;
        if (uid) saveKnownSources(uid, get().knownSources);
      },
    }),
    {
      name: 'bistro-storage-v2',
      // Only persist the splash-done flag — auth and data are restored by Firebase
      partialize: (s) => ({ splashDone: s.splashDone }),
    }
  )
);
