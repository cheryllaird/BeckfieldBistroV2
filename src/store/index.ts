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
  patchShoppingItems,
  deleteShoppingItemDoc,
  savePantryItem,
  savePantryItems,
  deletePantryItemDoc,
  saveKnownSources,
  saveGeminiApiKey,
  sendRecipeShare,
  subscribeToIncomingShares,
  acceptShare as firestoreAcceptShare,
  dismissShare as firestoreDismissShare,
} from '../lib/firestore';
import {
  diffShoppingLists,
  nextClock,
  reconcileShoppingSnapshot,
} from '../lib/shoppingSync';
import type { Recipe, MealEntry, ShoppingItem, PantryItem, AppState, SharedRecipe } from '../types';

// Module-level ref so it's never serialized into Zustand state or localStorage
let _unsubscribeUserData: (() => void) | null = null;
let _unsubscribeShares: (() => void) | null = null;

interface Store extends AppState {
  incomingShares: SharedRecipe[];

  // Recipe actions
  addRecipe: (recipe: Omit<Recipe, 'userId'>) => Promise<void>;
  updateRecipe: (recipe: Recipe) => Promise<void>;
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

  // Settings actions
  setGeminiApiKey: (key: string) => Promise<void>;

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

// Reconciles an incoming Firestore snapshot with the current local copy of a
// collection, resolving per-item conflicts by recency (`updatedAt`). This is the
// fix for "I changed something, reopened, and the change was gone": the realtime
// listener used to replace local state wholesale, so a stale snapshot — e.g. the
// server hadn't yet received an edit made while the mobile connection was dormant
// — would clobber the correct local state and then re-persist the stale data
// over it.
//
// Used for recipes, meal entries and pantry items. The shopping list — the
// collection two devices actually edit concurrently — uses the stronger
// field-level merge in lib/shoppingSync.ts instead.
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
function reconcileByRecency<T extends { id: string }>(
  incoming: T[],
  local: T[],
  timeOf: (item: T) => number,
): { merged: T[]; toResend: T[] } {
  const localById = new Map(local.map((i) => [i.id, i]));
  const toResend: T[] = [];
  const merged = incoming.map((inc) => {
    const loc = localById.get(inc.id);
    if (loc && timeOf(loc) > timeOf(inc)) {
      toResend.push(loc);
      return loc;
    }
    return inc;
  });
  return { merged, toResend };
}

// Time accessors for reconcileByRecency. Most collections stamp a numeric epoch
// in `updatedAt`; recipes carry an ISO-8601 `updatedAt` string (set on every
// save), so parse it. Missing/unparseable stamps sort oldest (0).
const byUpdatedAt = (i: { updatedAt?: number }) => i.updatedAt ?? 0;
const byUpdatedAtISO = (r: Recipe) => {
  const t = Date.parse(r.updatedAt);
  return Number.isNaN(t) ? 0 : t;
};

// Stamps `updatedAt` on items whose synced content actually changed, so the
// recency-based reconcile above can tell a real edit from an untouched item.
// `contentEqual` defines what counts as a change for the collection; pure
// reordering is deliberately excluded by its callers, because order is carried
// by the `order` field and a snapshot that only differs in order ties on
// `updatedAt`, so the incoming (server) ordering is taken.
function stampChanged<T extends { id: string; updatedAt?: number }>(
  prev: T[],
  next: T[],
  now: number,
  contentEqual: (a: T, b: T) => boolean,
): T[] {
  const prevById = new Map(prev.map((i) => [i.id, i]));
  return next.map((item) => {
    const before = prevById.get(item.id);
    if (before && contentEqual(before, item)) return item;
    return { ...item, updatedAt: now };
  });
}

const pantryContentEqual = (a: PantryItem, b: PantryItem) =>
  a.name === b.name && a.normalizedName === b.normalizedName && a.category === b.category;

// Tombstone docs already hard-deleted this session, so each is only purged
// once no matter how many snapshots report it. Cleared on sign-in/out.
const _purgedTombstoneIds = new Set<string>();

// Routes every shopping-list mutation through the diff engine in
// lib/shoppingSync.ts: the store keeps the freshly-stamped list, and only the
// field groups that actually changed are written to Firestore as merge
// patches (removed items become tombstones). See shoppingSync.ts for why this
// is what makes two-device offline editing safe.
function applyShoppingListUpdate(
  next: ShoppingItem[],
  set: (partial: Partial<Store>) => void,
  get: () => Store,
) {
  const s = get();
  const clock = nextClock(s.shoppingItems, s.shoppingTombstones);
  const { items, patches, tombstones } = diffShoppingLists(
    s.shoppingItems,
    next,
    clock,
    s.shoppingTombstones,
  );
  set({ shoppingItems: items, shoppingTombstones: tombstones });
  const uid = s.user?.uid;
  if (uid && patches.length) patchShoppingItems(uid, patches);
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
      applyCollectionSnapshot('recipes', recipes, get().recipes.length, () => {
        const { merged, toResend } = reconcileByRecency(recipes, get().recipes, byUpdatedAtISO);
        set({ recipes: merged });
        if (toResend.length) toResend.forEach((r) => saveRecipe(uid, r).catch(() => {}));
      });
    },
    onMealEntries: (mealEntries) => {
      applyCollectionSnapshot('mealEntries', mealEntries, get().mealEntries.length, () => {
        const { merged, toResend } = reconcileByRecency(mealEntries, get().mealEntries, byUpdatedAt);
        set({ mealEntries: merged });
        if (toResend.length) toResend.forEach((e) => saveMealEntry(uid, e));
      });
    },
    onShoppingItems: (incoming) => {
      // `incoming` is raw docs, tombstoned ones included — deletions arrive as
      // explicit `deleted: true` docs, never as absence, so a non-empty
      // snapshot is always safe to apply immediately.
      applyCollectionSnapshot('shoppingItems', incoming, get().shoppingItems.length, () => {
        const { items, tombstones, resend, purgeIds } = reconcileShoppingSnapshot(
          incoming,
          get().shoppingItems,
          get().shoppingTombstones,
          Date.now(),
        );
        set({ shoppingItems: items, shoppingTombstones: tombstones });
        // Re-push the field groups the local copy won so the server catches
        // up. Resent patches carry the same clocks, so when they echo back
        // they tie and the incoming copy is taken — convergence terminates,
        // no write loop.
        if (resend.length) patchShoppingItems(uid, resend);
        // Garbage-collect tombstones past retention (once per session each).
        for (const id of purgeIds) {
          if (_purgedTombstoneIds.has(id)) continue;
          _purgedTombstoneIds.add(id);
          deleteShoppingItemDoc(uid, id);
        }
      });
    },
    onPantryItems: (pantryItems) => {
      applyCollectionSnapshot('pantryItems', pantryItems, get().pantryItems.length, () => {
        const { merged, toResend } = reconcileByRecency(pantryItems, get().pantryItems, byUpdatedAt);
        set({ pantryItems: merged });
        if (toResend.length) toResend.forEach((item) => savePantryItem(uid, item));
      });
    },
    onKnownSources: (knownSources) => {
      applyCollectionSnapshot('knownSources', knownSources, get().knownSources.length, () =>
        set({ knownSources }),
      );
    },
    onHasGeminiApiKey: (hasGeminiApiKey) => set({ hasGeminiApiKey }),
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
      shoppingTombstones: {},
      pantryItems: [],
      knownSources: [],
      hasGeminiApiKey: false,
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

      updateRecipe: async (recipe) => {
        set((s) => ({ recipes: s.recipes.map((r) => (r.id === recipe.id ? recipe : r)) }));
        const uid = get().user?.uid;
        if (uid) await saveRecipe(uid, recipe);
      },

      deleteRecipe: (id) => {
        set((s) => ({ recipes: s.recipes.filter((r) => r.id !== id) }));
        const uid = get().user?.uid;
        if (uid) deleteRecipeDoc(uid, id);
      },

      addMealEntry: (entry) => {
        const stamped: MealEntry = { ...entry, updatedAt: Date.now() };
        set((s) => ({ mealEntries: [...s.mealEntries, stamped] }));
        const uid = get().user?.uid;
        if (uid) saveMealEntry(uid, stamped);
      },

      updateMealEntry: (entry) => {
        const stamped: MealEntry = { ...entry, updatedAt: Date.now() };
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

      setShoppingItems: (items) => applyShoppingListUpdate(items, set, get),

      toggleShoppingItem: (id) => {
        const s = get();
        const item = s.shoppingItems.find((i) => i.id === id);
        if (!item) return;
        // Patch only the checked group: a toggle replayed from an offline
        // queue can then never clobber a rename/reorder made elsewhere.
        const clock = nextClock(s.shoppingItems, s.shoppingTombstones);
        const updated: ShoppingItem = { ...item, checked: !item.checked, checkedAt: clock };
        set({
          shoppingItems: s.shoppingItems.map((i) => (i.id === id ? updated : i)),
        });
        const uid = s.user?.uid;
        if (uid) patchShoppingItems(uid, [{ id, checked: updated.checked, checkedAt: clock }]);
      },

      addShoppingItem: (item) =>
        applyShoppingListUpdate([...get().shoppingItems, item], set, get),

      removeShoppingItem: (id) =>
        applyShoppingListUpdate(
          get().shoppingItems.filter((i) => i.id !== id),
          set,
          get,
        ),

      reorderShoppingItems: (items) => applyShoppingListUpdate(items, set, get),

      clearCheckedItems: () =>
        applyShoppingListUpdate(
          get().shoppingItems.filter((i) => !i.checked),
          set,
          get,
        ),

      addPantryItem: (item) => {
        const stamped: PantryItem = { ...item, updatedAt: Date.now() };
        set((s) => ({ pantryItems: [...s.pantryItems, stamped] }));
        const uid = get().user?.uid;
        if (uid) savePantryItem(uid, stamped);
      },

      updatePantryItem: (item) => {
        const stamped: PantryItem = { ...item, updatedAt: Date.now() };
        set((s) => ({ pantryItems: s.pantryItems.map((p) => (p.id === item.id ? stamped : p)) }));
        const uid = get().user?.uid;
        if (uid) savePantryItem(uid, stamped);
      },

      removePantryItem: (id) => {
        set((s) => ({ pantryItems: s.pantryItems.filter((i) => i.id !== id) }));
        const uid = get().user?.uid;
        if (uid) deletePantryItemDoc(uid, id);
      },

      reorderPantryItems: (items) => {
        // Reordering changes only position (carried by `order`), not item
        // content, so no updatedAt bump — see stampChanged.
        const stamped = stampChanged(get().pantryItems, items, Date.now(), pantryContentEqual);
        set({ pantryItems: stamped });
        const uid = get().user?.uid;
        if (uid) savePantryItems(uid, stamped);
      },

      signIn: (firebaseUser) => {
        const existingUid = get().user?.uid;

        // If listeners are already live for this same account — the normal
        // launch path, where resubscribe() attached them from the persisted
        // session and Firebase then confirmed the same user — keep them.
        // Tearing down and re-adding the same five listeners back-to-back
        // churns watch-target adds/removes on the Listen stream, the race
        // behind Firestore's fatal "INTERNAL ASSERTION FAILED (ID: ca9)"
        // (firebase-js-sdk#9267), and buys nothing.
        const keepListeners =
          _unsubscribeUserData !== null && existingUid === firebaseUser.uid;

        if (!keepListeners) {
          // Tear down any previous listeners (e.g. switching accounts)
          _unsubscribeUserData?.();
          _unsubscribeShares?.();
          _unsubscribeUserData = null;
          _unsubscribeShares = null;
          // Cancel pending empty-snapshot timers from the previous session so
          // they can't fire against this account's freshly loaded data.
          clearPendingEmptyTimers();
          _purgedTombstoneIds.clear();
        }

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
            shoppingTombstones: {},
            pantryItems: [],
            knownSources: [],
            hasGeminiApiKey: false,
            incomingShares: [],
          }),
        });

        if (!keepListeners) {
          attachListeners(firebaseUser.uid, firebaseUser.email, set, get);
        }
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
        _purgedTombstoneIds.clear();
        if (auth) await firebaseSignOut(auth);
        set({
          isAuthenticated: false,
          user: null,
          recipes: [],
          mealEntries: [],
          shoppingItems: [],
          shoppingTombstones: {},
          pantryItems: [],
          knownSources: [],
          hasGeminiApiKey: false,
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

      setGeminiApiKey: async (key) => {
        if (!get().user) return;
        const hasGeminiApiKey = await saveGeminiApiKey(key);
        set({ hasGeminiApiKey });
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
        // Persisted so a delete made offline survives an app restart — the
        // tombstone must outlive the session to keep beating stale copies.
        shoppingTombstones: s.shoppingTombstones,
        pantryItems: s.pantryItems,
        knownSources: s.knownSources,
        hasGeminiApiKey: s.hasGeminiApiKey,
      }),
    },
  ),
);
