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

// Reconciles an incoming shopping-item snapshot against the locally-held items
// using each item's `checkedAt` timestamp (last-write-wins). When the local
// copy is strictly newer than the snapshot and its checked state differs, the
// local toggle wins and is re-saved so the unsynced write is re-queued to the
// server. This recovers toggles that didn't survive a refresh — common on
// Android/iOS PWAs where Firestore's IndexedDB cache silently drops pending
// writes — without losing newer changes made on another device.
function reconcileShoppingItems(
  incoming: ShoppingItem[],
  get: () => Store,
  set: (partial: Partial<Store>) => void,
) {
  const localById = new Map(get().shoppingItems.map((i) => [i.id, i]));
  const uid = get().user?.uid;

  const merged = incoming.map((item) => {
    const local = localById.get(item.id);
    if (!local) return item;
    const localTs = local.checkedAt ?? 0;
    const serverTs = item.checkedAt ?? 0;
    if (localTs > serverTs && local.checked !== item.checked) {
      const winner = { ...item, checked: local.checked, checkedAt: localTs };
      if (uid) saveShoppingItem(uid, winner);
      return winner;
    }
    return item;
  });

  set({ shoppingItems: merged });
}

// How long a locally-held meal entry that is missing from the server snapshot is
// still treated as an unsynced add (and re-saved) rather than a deletion. Covers
// the common "added a meal, write was dropped, refreshed" case while not
// resurrecting entries genuinely deleted on another device (those carry an old
// updatedAt). Generous because a stuck SDK may not resync until reopened.
const MEAL_RESURRECT_WINDOW_MS = 24 * 60 * 60 * 1000;

// Reconciles an incoming meal-entry snapshot against the locally-held entries.
// Like reconcileShoppingItems, this recovers writes that didn't survive a refresh
// — common on Android/iOS PWAs where Firestore's IndexedDB cache silently drops
// pending writes. Meal entries carry no `checked` flag, so the unit of conflict
// is the whole entry, compared by `updatedAt` (last-write-wins):
//
//   1. present in both: the side with the newer `updatedAt` wins; a local win is
//      re-saved so the unsynced edit is re-queued to the server.
//   2. present only locally with a recent `updatedAt`: treated as an unsynced add
//      and kept + re-saved. Older local-only entries are dropped (the server is
//      authoritative for membership, so deletions made elsewhere stick).
//
// Genuine deletions mutate the store directly (deleteMealEntry), so dropping
// stale local-only entries here is safe.
function reconcileMealEntries(
  incoming: MealEntry[],
  get: () => Store,
  set: (partial: Partial<Store>) => void,
) {
  const localById = new Map(get().mealEntries.map((e) => [e.id, e]));
  const uid = get().user?.uid;
  const now = Date.now();

  const merged = incoming.map((entry) => {
    const local = localById.get(entry.id);
    localById.delete(entry.id);
    if (!local) return entry;
    const localTs = local.updatedAt ?? 0;
    const serverTs = entry.updatedAt ?? 0;
    if (localTs > serverTs) {
      if (uid) saveMealEntry(uid, local);
      return local;
    }
    return entry;
  });

  // Whatever remains in localById was not in the server snapshot. Keep (and
  // re-queue) only the recently-written ones as unsynced adds.
  for (const local of localById.values()) {
    if ((local.updatedAt ?? 0) > now - MEAL_RESURRECT_WINDOW_MS) {
      if (uid) saveMealEntry(uid, local);
      merged.push(local);
    }
  }

  set({ mealEntries: merged });
}

// Decides whether an incoming snapshot should be dropped instead of written
// to the store. Two cases, both of which would otherwise clobber the data
// Zustand hydrated from localStorage (the reliable offline copy):
//
//   1. fromCache emission while we already hold data — Firestore's IndexedDB
//      cache is unreliable on Android/iOS PWAs and can emit stale snapshots on
//      refresh.
//   2. an *empty* emission (cache OR server) while we already hold data — on
//      mobile the SDK can briefly report a collection empty before the real
//      server result lands. Applying it wipes the store to [], which also
//      disarms guard (1) for every later snapshot, causing the "flash empty
//      then reappear with stale state" bug. Genuine deletions never rely on an
//      empty snapshot: they mutate the store directly (removeShoppingItem,
//      clearCheckedItems, deleteRecipe, …), so dropping empty emissions here is
//      safe.
//
// Server-confirmed, non-empty snapshots are always authoritative and applied.
function shouldSkipSnapshot(incomingLen: number, localLen: number, fromCache: boolean) {
  if (localLen === 0) return false;
  return fromCache || incomingLen === 0;
}

// Attaches realtime Firestore listeners for a given user. The first emission
// reflects Firestore's local IndexedDB cache (or is skipped when empty via
// the skipIfCacheMiss guard in firestore.ts); subsequent emissions are
// server-confirmed (fromCache === false).
function attachListeners(
  uid: string,
  email: string | null,
  set: (partial: Partial<Store>) => void,
  get: () => Store,
) {
  _unsubscribeUserData = subscribeToUserData(uid, {
    onRecipes: (recipes, fromCache) => {
      if (shouldSkipSnapshot(recipes.length, get().recipes.length, fromCache)) return;
      set({ recipes });
    },
    onMealEntries: (mealEntries, fromCache) => {
      if (shouldSkipSnapshot(mealEntries.length, get().mealEntries.length, fromCache)) return;
      reconcileMealEntries(mealEntries, get, set);
    },
    onShoppingItems: (shoppingItems, fromCache) => {
      if (shouldSkipSnapshot(shoppingItems.length, get().shoppingItems.length, fromCache)) return;
      reconcileShoppingItems(shoppingItems, get, set);
    },
    onPantryItems: (pantryItems, fromCache) => {
      if (shouldSkipSnapshot(pantryItems.length, get().pantryItems.length, fromCache)) return;
      set({ pantryItems });
    },
    onKnownSources: (knownSources, fromCache) => {
      if (shouldSkipSnapshot(knownSources.length, get().knownSources.length, fromCache)) return;
      set({ knownSources });
    },
  });

  if (email) {
    _unsubscribeShares = subscribeToIncomingShares(email, (incomingShares) =>
      set({ incomingShares }),
    );
  }
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
        const stamped = { ...entry, updatedAt: Date.now() };
        set((s) => ({ mealEntries: [...s.mealEntries, stamped] }));
        const uid = get().user?.uid;
        if (uid) saveMealEntry(uid, stamped);
      },

      updateMealEntry: (entry) => {
        const stamped = { ...entry, updatedAt: Date.now() };
        set((s) => ({
          mealEntries: s.mealEntries.map((e) => (e.id === entry.id ? stamped : e)),
        }));
        const uid = get().user?.uid;
        if (uid) saveMealEntry(uid, stamped);
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
        const checkedAt = Date.now();
        set((s) => ({
          shoppingItems: s.shoppingItems.map((item) =>
            item.id === id ? { ...item, checked: !item.checked, checkedAt } : item,
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
        _unsubscribeUserData = null;
        _unsubscribeShares = null;

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

        attachListeners(firebaseUser.uid, firebaseUser.email, set, get);
      },

      // Re-attaches Firestore listeners for a cached user without resetting
      // auth state. Called on page load when persisted auth exists so that
      // IndexedDB data is available immediately, before Firebase validates.
      resubscribe: () => {
        const { user } = get();
        if (!user || _unsubscribeUserData) return;
        attachListeners(user.uid, user.email, set, get);
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
    },
  ),
);
