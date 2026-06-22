import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { signOut as firebaseSignOut } from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { idbStorage } from '../lib/idbStorage';
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

// Per-collection timers that debounce empty snapshots (see
// applyCollectionSnapshot below). Cleared whenever listeners are torn down so
// a stale timer from a previous account/session can never fire against the
// next account's freshly loaded data.
const _pendingEmptyTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearPendingEmptyTimers() {
  _pendingEmptyTimers.forEach(clearTimeout);
  _pendingEmptyTimers.clear();
}

// Applies an incoming Firestore snapshot to the store, debouncing empty
// results so a transient "collection looks empty" read doesn't wipe out data
// that's about to be confirmed as non-empty a moment later — the "flash empty
// then reappear with stale state" bug seen on Android/iOS PWA refreshes.
//
// Non-empty snapshots are applied immediately and unconditionally. Note that
// `fromCache` is *not* used as a trust signal here: with persistentLocalCache
// enabled, snapshots carrying genuinely fresh edits made on another device are
// routinely reported `fromCache: true` (the cache is how synced data is
// served), so gating on it just freezes other devices on old data — which was
// the actual cause of "edits on device A never show up on device B".
//
// An empty snapshot while local data exists is ambiguous — it could be that
// transient mid-sync read, or a genuine clear/delete-all (made locally or on
// another device). Resolve the ambiguity with a short debounce: a follow-up
// non-empty snapshot cancels the pending empty (it was transient) and is
// applied instead; if nothing else arrives, the empty result was genuine and
// gets applied once the timer fires.
// Reconciles an incoming Firestore snapshot of shopping items with the current
// local copy, resolving per-item conflicts by recency (`updatedAt`). This is the
// fix for "I ticked items off, reopened, and they were unticked": the realtime
// listener used to replace local state wholesale, so a stale snapshot — e.g. the
// server hadn't yet received a toggle made while the mobile connection was
// dormant — would clobber the correct local state and then re-persist the stale
// data over it.
//
// Rules:
//  • An item present on both sides keeps whichever copy has the newer
//    `updatedAt`. A locally-newer item (an unsynced edit) wins and is collected
//    in `toResend` so it gets pushed back to the server and both sides converge.
//  • Items only in the snapshot are taken as-is (created/edited on another
//    device, or confirmed by the server).
//  • Items only in the local copy are dropped — matching the previous
//    replace-everything behaviour, so an item deleted on another device stays
//    deleted rather than resurrecting. Genuinely unsynced local additions are
//    still present in the snapshot because Firestore's persistent cache replays
//    pending writes, so they are not lost here.
//
// `updatedAt` is compared as a number with missing treated as 0, so a stamped
// local edit always beats an older un-stamped server copy.
function reconcileShoppingItems(
  incoming: ShoppingItem[],
  local: ShoppingItem[],
): { merged: ShoppingItem[]; toResend: ShoppingItem[] } {
  const localById = new Map(local.map((i) => [i.id, i]));
  const toResend: ShoppingItem[] = [];
  const merged = incoming.map((inc) => {
    const loc = localById.get(inc.id);
    if (loc && (loc.updatedAt ?? 0) > (inc.updatedAt ?? 0)) {
      toResend.push(loc);
      return loc;
    }
    return inc;
  });
  return { merged, toResend };
}

// Stamps `updatedAt` on items whose synced content actually changed (new items,
// or a changed name/checked/category) so the recency-based reconcile above can
// tell a real edit from an untouched item. Pure reordering does not bump the
// stamp: order is carried by the `order` field and a snapshot that only differs
// in order ties on `updatedAt`, so the incoming (server) ordering is taken.
function stampChangedShoppingItems(
  prev: ShoppingItem[],
  next: ShoppingItem[],
  now: number,
): ShoppingItem[] {
  const prevById = new Map(prev.map((i) => [i.id, i]));
  return next.map((item) => {
    const before = prevById.get(item.id);
    if (
      before &&
      before.name === item.name &&
      before.checked === item.checked &&
      before.category === item.category
    ) {
      return item;
    }
    return { ...item, updatedAt: now };
  });
}

function applyCollectionSnapshot<T>(
  key: string,
  incoming: T[],
  localLen: number,
  apply: () => void,
) {
  const pending = _pendingEmptyTimers.get(key);
  if (pending) {
    clearTimeout(pending);
    _pendingEmptyTimers.delete(key);
  }

  if (incoming.length > 0 || localLen === 0) {
    apply();
    return;
  }

  _pendingEmptyTimers.set(
    key,
    setTimeout(() => {
      _pendingEmptyTimers.delete(key);
      apply();
    }, 1500),
  );
}

// Attaches realtime Firestore listeners for a given user, keeping the store
// live-synced with edits made on every device signed into the same account.
function attachListeners(
  uid: string,
  email: string | null,
  set: (partial: Partial<Store>) => void,
  get: () => Store,
) {
  _unsubscribeUserData = subscribeToUserData(uid, {
    onRecipes: (recipes) => {
      applyCollectionSnapshot('recipes', recipes, get().recipes.length, () => set({ recipes }));
    },
    onMealEntries: (mealEntries) => {
      applyCollectionSnapshot('mealEntries', mealEntries, get().mealEntries.length, () =>
        set({ mealEntries }),
      );
    },
    onShoppingItems: (shoppingItems) => {
      applyCollectionSnapshot('shoppingItems', shoppingItems, get().shoppingItems.length, () => {
        const { merged, toResend } = reconcileShoppingItems(shoppingItems, get().shoppingItems);
        set({ shoppingItems: merged });
        // Re-push any item the local copy won so the server catches up. The
        // resent doc carries the same updatedAt, so the snapshot it triggers
        // ties and is taken as-is — convergence terminates, no write loop.
        if (toResend.length) toResend.forEach((item) => saveShoppingItem(uid, item));
      });
    },
    onPantryItems: (pantryItems) => {
      applyCollectionSnapshot('pantryItems', pantryItems, get().pantryItems.length, () =>
        set({ pantryItems }),
      );
    },
    onKnownSources: (knownSources) => {
      applyCollectionSnapshot('knownSources', knownSources, get().knownSources.length, () =>
        set({ knownSources }),
      );
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
        // Stamp only items whose content changed so the recency-based reconcile
        // can distinguish a real edit from an untouched item on the next sync.
        const stamped = stampChangedShoppingItems(get().shoppingItems, items, Date.now());
        set({ shoppingItems: stamped });
        const uid = get().user?.uid;
        if (uid) saveShoppingItems(uid, stamped);
      },

      toggleShoppingItem: (id) => {
        const now = Date.now();
        set((s) => ({
          shoppingItems: s.shoppingItems.map((item) =>
            item.id === id ? { ...item, checked: !item.checked, updatedAt: now } : item,
          ),
        }));
        const uid = get().user?.uid;
        if (uid) {
          const item = get().shoppingItems.find((i) => i.id === id);
          if (item) saveShoppingItem(uid, item);
        }
      },

      addShoppingItem: (item) => {
        const stamped: ShoppingItem = { ...item, updatedAt: Date.now() };
        set((s) => ({ shoppingItems: [...s.shoppingItems, stamped] }));
        const uid = get().user?.uid;
        if (uid) saveShoppingItem(uid, stamped);
      },

      removeShoppingItem: (id) => {
        set((s) => ({ shoppingItems: s.shoppingItems.filter((i) => i.id !== id) }));
        const uid = get().user?.uid;
        if (uid) deleteShoppingItemDoc(uid, id);
      },

      reorderShoppingItems: (items) => {
        // Reordering changes only position (carried by `order`), not item
        // content, so no updatedAt bump — see stampChangedShoppingItems.
        const stamped = stampChangedShoppingItems(get().shoppingItems, items, Date.now());
        set({ shoppingItems: stamped });
        const uid = get().user?.uid;
        if (uid) saveShoppingItems(uid, stamped);
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
        // Cancel pending empty-snapshot timers from the previous session so
        // they can't fire against this account's freshly loaded data.
        clearPendingEmptyTimers();

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
        clearPendingEmptyTimers();
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
      // IndexedDB-backed storage (see idbStorage). localStorage's ~5MB quota was
      // overflowed by recipes' embedded base64 images, which made the persist
      // write throw inside set() and reverted state on refresh. IndexedDB has a
      // far larger quota, so the full state — images included — persists for a
      // reliable offline library. The adapter also swallows write errors so a
      // persist failure can never throw out of a store action.
      storage: createJSONStorage(() => idbStorage),
      // Persist auth identity AND data collections so the library loads
      // immediately from storage when offline, without waiting for Firestore's
      // own IndexedDB cache (which requires a live auth token to initialise and
      // can be absent on the first offline session).
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
