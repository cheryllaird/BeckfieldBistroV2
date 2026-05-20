import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { signOut as firebaseSignOut } from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import { auth } from '../lib/firebase';
import {
  subscribeToUserData,
  saveRecipe,
  deleteRecipeDoc,
  saveMealEntry,
  deleteMealEntryDoc,
  saveShoppingItem,
  saveShoppingItems,
  deleteShoppingItemDoc,
  savePantryItem,
  savePantryItems,
  deletePantryItemDoc,
  saveKnownSources,
  sendRecipeShare,
  subscribeToIncomingShares,
  acceptShare as firestoreAcceptShare,
  dismissShare as firestoreDismissShare,
} from '../lib/firestore';
import type { Recipe, MealEntry, ShoppingItem, PantryItem, AppState, SharedRecipe } from '../types';

// Module-level ref so it's never serialized into Zustand state or localStorage
let _unsubscribeUserData: (() => void) | null = null;
let _unsubscribeShares: (() => void) | null = null;

interface Store extends AppState {
  incomingShares: SharedRecipe[];

  // Recipe actions
  addRecipe: (recipe: Omit<Recipe, 'userId'>) => Promise<void>;
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

  // Pantry actions
  addPantryItem: (item: PantryItem) => void;
  updatePantryItem: (item: PantryItem) => void;
  removePantryItem: (id: string) => void;
  reorderPantryItems: (items: PantryItem[]) => void;

  // Auth actions
  signIn: (firebaseUser: FirebaseUser) => void;
  resubscribe: () => void;
  signOut: () => Promise<void>;
  setSplashDone: () => void;

  // Source actions
  addSource: (source: string) => void;

  // Sharing actions
  sendRecipe: (recipe: Recipe, toEmail: string) => Promise<void>;
  acceptShare: (share: SharedRecipe) => Promise<string>;
  dismissShare: (shareId: string) => Promise<void>;
  acceptAllShares: () => Promise<void>;
  dismissAllShares: () => Promise<void>;
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      recipes: [],
      mealEntries: [],
      shoppingItems: [],
      pantryItems: [],
      knownSources: [],
      isAuthenticated: false,
      user: null,
      splashDone: false,
      incomingShares: [],

      addRecipe: async (recipe) => {
        const uid = get().user?.uid ?? '';
        const recipeWithUser: Recipe = { ...recipe, userId: uid };
        set((s) => ({
          recipes: [recipeWithUser, ...s.recipes],
          knownSources: s.knownSources.includes(recipeWithUser.source)
            ? s.knownSources
            : [...s.knownSources, recipeWithUser.source],
        }));
        if (uid) {
          await saveRecipe(uid, recipeWithUser);
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

      addPantryItem: (item) => {
        set((s) => ({ pantryItems: [...s.pantryItems, item] }));
        const uid = get().user?.uid;
        if (uid) savePantryItem(uid, item);
      },

      updatePantryItem: (item) => {
        set((s) => ({ pantryItems: s.pantryItems.map((p) => (p.id === item.id ? item : p)) }));
        const uid = get().user?.uid;
        if (uid) savePantryItem(uid, item);
      },

      removePantryItem: (id) => {
        set((s) => ({ pantryItems: s.pantryItems.filter((i) => i.id !== id) }));
        const uid = get().user?.uid;
        if (uid) deletePantryItemDoc(uid, id);
      },

      reorderPantryItems: (items) => {
        set({ pantryItems: items });
        const uid = get().user?.uid;
        if (uid) savePantryItems(uid, items);
      },

      signIn: (firebaseUser) => {
        // Tear down any previous listeners (e.g. if signIn is called twice)
        _unsubscribeUserData?.();
        _unsubscribeShares?.();

        const existingUid = get().user?.uid;

        set({
          isAuthenticated: true,
          user: {
            uid: firebaseUser.uid,
            name: firebaseUser.displayName ?? 'User',
            email: firebaseUser.email ?? '',
            avatar: firebaseUser.photoURL ?? undefined,
          },
          // Only wipe collections when switching accounts. Require existingUid
          // to be defined so an unhydrated store (existingUid === undefined)
          // doesn't satisfy `undefined !== uid` and incorrectly wipe data.
          ...(existingUid && existingUid !== firebaseUser.uid && {
            recipes: [],
            mealEntries: [],
            shoppingItems: [],
            pantryItems: [],
            knownSources: [],
            incomingShares: [],
          }),
        });

        // Subscribe to real-time updates. First emission loads initial data;
        // subsequent emissions reflect changes from any device or tab.
        //
        // fromCache=true: Firestore served from its local IndexedDB (offline or
        // server not yet reached). When the store already has data from Zustand's
        // localStorage persist, that persisted data is the reliable offline copy —
        // skip stale/partial Firestore cache snapshots. fromCache=false (server-
        // confirmed) is always authoritative and always applied.
        _unsubscribeUserData = subscribeToUserData(firebaseUser.uid, {
          onRecipes: (recipes, fromCache) => {
            if (fromCache && get().recipes.length > 0) return;
            set({ recipes });
          },
          onMealEntries: (mealEntries, fromCache) => {
            if (fromCache && get().mealEntries.length > 0) return;
            set({ mealEntries });
          },
          onShoppingItems: (shoppingItems, fromCache) => {
            if (fromCache && get().shoppingItems.length > 0) return;
            set({ shoppingItems });
          },
          onPantryItems: (pantryItems, fromCache) => {
            if (fromCache && get().pantryItems.length > 0) return;
            set({ pantryItems });
          },
          onKnownSources: (knownSources, fromCache) => {
            if (fromCache && get().knownSources.length > 0) return;
            set({ knownSources });
          },
        });

        // Subscribe to incoming recipe shares for this user's email
        if (firebaseUser.email) {
          _unsubscribeShares = subscribeToIncomingShares(firebaseUser.email, (incomingShares) =>
            set({ incomingShares })
          );
        }
      },

      // Re-attaches Firestore listeners for a cached user without resetting
      // auth state. Called on page load when persisted auth exists so that
      // IndexedDB data is available immediately, before Firebase validates.
      resubscribe: () => {
        const { user } = get();
        if (!user || _unsubscribeUserData) return;
        _unsubscribeUserData = subscribeToUserData(user.uid, {
          onRecipes: (recipes, fromCache) => {
            if (fromCache && get().recipes.length > 0) return;
            set({ recipes });
          },
          onMealEntries: (mealEntries, fromCache) => {
            if (fromCache && get().mealEntries.length > 0) return;
            set({ mealEntries });
          },
          onShoppingItems: (shoppingItems, fromCache) => {
            if (fromCache && get().shoppingItems.length > 0) return;
            set({ shoppingItems });
          },
          onPantryItems: (pantryItems, fromCache) => {
            if (fromCache && get().pantryItems.length > 0) return;
            set({ pantryItems });
          },
          onKnownSources: (knownSources, fromCache) => {
            if (fromCache && get().knownSources.length > 0) return;
            set({ knownSources });
          },
        });
        if (user.email) {
          _unsubscribeShares = subscribeToIncomingShares(user.email, (incomingShares) =>
            set({ incomingShares })
          );
        }
      },

      signOut: async () => {
        // Tear down listeners before clearing state so no orphaned callbacks fire
        _unsubscribeUserData?.();
        _unsubscribeUserData = null;
        _unsubscribeShares?.();
        _unsubscribeShares = null;
        if (auth) await firebaseSignOut(auth);
        set({
          isAuthenticated: false,
          user: null,
          recipes: [],
          mealEntries: [],
          shoppingItems: [],
          pantryItems: [],
          knownSources: [],
          incomingShares: [],
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

      sendRecipe: async (recipe, toEmail) => {
        const user = get().user;
        if (!user) return;
        const share: Omit<SharedRecipe, 'id'> = {
          fromUid: user.uid,
          fromName: user.name,
          fromAvatar: user.avatar,
          toEmail,
          recipe: {
            title: recipe.title,
            source: recipe.source,
            sourceUrl: recipe.sourceUrl,
            coverImage: recipe.coverImage,
            originalImage: recipe.originalImage,
            servings: recipe.servings,
            prepTime: recipe.prepTime,
            totalTime: recipe.totalTime,
            ingredients: recipe.ingredients,
            ingredientSections: recipe.ingredientSections,
            steps: recipe.steps,
            createdAt: recipe.createdAt,
            updatedAt: recipe.updatedAt,
          },
          createdAt: new Date().toISOString(),
        };
        await sendRecipeShare(share);
      },

      acceptShare: async (share) => {
        const uid = get().user?.uid;
        if (!uid) return '';
        const newId = await firestoreAcceptShare(share.id, uid, share.recipe);
        set((s) => ({ incomingShares: s.incomingShares.filter((sh) => sh.id !== share.id) }));
        return newId;
      },

      dismissShare: async (shareId) => {
        await firestoreDismissShare(shareId);
        set((s) => ({ incomingShares: s.incomingShares.filter((sh) => sh.id !== shareId) }));
      },

      acceptAllShares: async () => {
        const uid = get().user?.uid;
        if (!uid) return;
        const shares = get().incomingShares;
        await Promise.all(shares.map((share) => firestoreAcceptShare(share.id, uid, share.recipe)));
        set({ incomingShares: [] });
      },

      dismissAllShares: async () => {
        const shares = get().incomingShares;
        await Promise.all(shares.map((share) => firestoreDismissShare(share.id)));
        set({ incomingShares: [] });
      },
    }),
    {
      name: 'bistro-storage-v2',
      // Persist auth identity AND data collections so the library loads
      // immediately from localStorage when offline, without waiting for
      // Firestore's IndexedDB cache (which requires a live auth token to
      // initialise and can be absent on the first offline session).
      // incomingShares is excluded: it requires a network fetch and is stale
      // as soon as a share is accepted/dismissed on another device.
      partialize: (s) => ({
        splashDone: s.splashDone,
        user: s.user,
        isAuthenticated: s.isAuthenticated,
        recipes: s.recipes,
        mealEntries: s.mealEntries,
        shoppingItems: s.shoppingItems,
        pantryItems: s.pantryItems,
        knownSources: s.knownSources,
      }),
    }
  )
);
