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
  logCategoryOverride as firestoreLogCategoryOverride,
  flushPendingWrites,
  setDataRoot,
  subscribeToBistroAccess,
  subscribeToBistro,
  type BistroAccess,
} from '../lib/firestore';
import {
  fetchIncomingInvites,
  acceptInvite as apiAcceptInvite,
  declineInvite as apiDeclineInvite,
  renameBistro as apiRenameBistro,
  inviteMember as apiInviteMember,
  revokeInvite as apiRevokeInvite,
  removeMember as apiRemoveMember,
  leaveBistro as apiLeaveBistro,
  migrateBistroStep,
  placeholderBistro,
} from '../lib/bistro';
import {
  EMPTY_SCOPE,
  clearScopeCache,
  loadScopeCache,
  pickScopeData,
  saveScopeCache,
} from '../lib/scopeCache';
import {
  diffShoppingLists,
  nextClock,
  reconcileShoppingSnapshot,
} from '../lib/shoppingSync';
import type {
  Recipe,
  MealEntry,
  ShoppingItem,
  PantryItem,
  AppState,
  SharedRecipe,
  BistroInvite,
  CategoryOverrideLog,
  MigrationState,
} from '../types';

// Module-level refs so they're never serialized into Zustand state or storage.
// Data listeners follow the bistro being viewed; session listeners (shares,
// bistro access, bistro docs) follow the signed-in account.
let _unsubscribeUserData: (() => void) | null = null;
let _unsubscribeShares: (() => void) | null = null;
let _unsubscribeAccess: (() => void) | null = null;
const _bistroUnsubs = new Map<string, () => void>();
// Bistros the user is leaving right now, so the access listener dropping them
// isn't reported as "you were removed".
const _leaving = new Set<string>();
let _migrationRunning = false;
// Bumped by every switchBistro so a slower, superseded switch can't land last.
let _switchToken = 0;

/** The bistro whose data is loaded: the active one, else the user's own. */
export const scopeOf = (s: Pick<AppState, 'activeBistroId' | 'user'>) =>
  s.activeBistroId ?? s.user?.uid;

interface Store extends AppState {
  incomingShares: SharedRecipe[];
  pendingInvites: BistroInvite[];
  migration: MigrationState | null;
  // Name of a bistro the user was just removed from while viewing it.
  removedFromBistro: string | null;

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

  // Shopping list telemetry
  logCategoryOverride: (entry: Omit<CategoryOverrideLog, 'id'>) => void;

  // Bistro actions
  switchBistro: (bistroId: string) => Promise<void>;
  refreshInvites: () => Promise<void>;
  acceptInvite: (invite: BistroInvite) => Promise<string>;
  declineInvite: (inviteId: string) => Promise<void>;
  renameBistro: (bistroId: string, name: string) => Promise<void>;
  inviteMember: (bistroId: string, email: string) => Promise<void>;
  revokeInvite: (inviteId: string) => Promise<void>;
  removeMember: (bistroId: string, uid: string) => Promise<void>;
  leaveBistro: (bistroId: string) => Promise<void>;
  dismissRemovedNotice: () => void;
  retryMigration: () => void;
  // Leave the setup screen after a failed migration and keep using the legacy
  // paths (safe: nothing has cut over). The next launch tries again.
  skipMigration: () => void;
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
  const scope = scopeOf(s);
  if (scope && patches.length) patchShoppingItems(scope, patches);
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

type SetState = (partial: Partial<Store>) => void;

// Attaches realtime Firestore listeners for one bistro's data, keeping the
// store live-synced with edits made on every device and by every member.
function attachDataListeners(bistroId: string, ownUid: string, set: SetState, get: () => Store) {
  _unsubscribeUserData = subscribeToUserData(bistroId, ownUid, {
    onRecipes: (recipes) => {
      applyCollectionSnapshot('recipes', recipes, get().recipes.length, () => {
        const { merged, toResend } = reconcileByRecency(recipes, get().recipes, byUpdatedAtISO);
        set({ recipes: merged });
        if (toResend.length) toResend.forEach((r) => saveRecipe(bistroId, r).catch(() => {}));
      });
    },
    onMealEntries: (mealEntries) => {
      applyCollectionSnapshot('mealEntries', mealEntries, get().mealEntries.length, () => {
        const { merged, toResend } = reconcileByRecency(mealEntries, get().mealEntries, byUpdatedAt);
        set({ mealEntries: merged });
        if (toResend.length) toResend.forEach((e) => saveMealEntry(bistroId, e));
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
        if (resend.length) patchShoppingItems(bistroId, resend);
        // Garbage-collect tombstones past retention (once per session each).
        for (const id of purgeIds) {
          if (_purgedTombstoneIds.has(id)) continue;
          _purgedTombstoneIds.add(id);
          deleteShoppingItemDoc(bistroId, id);
        }
      });
    },
    onPantryItems: (pantryItems) => {
      applyCollectionSnapshot('pantryItems', pantryItems, get().pantryItems.length, () => {
        const { merged, toResend } = reconcileByRecency(pantryItems, get().pantryItems, byUpdatedAt);
        set({ pantryItems: merged });
        if (toResend.length) toResend.forEach((item) => savePantryItem(bistroId, item));
      });
    },
    onKnownSources: (knownSources) => {
      applyCollectionSnapshot('knownSources', knownSources, get().knownSources.length, () =>
        set({ knownSources }),
      );
    },
    onHasGeminiApiKey: (hasGeminiApiKey) => set({ hasGeminiApiKey }),
    onError: (err) => {
      // Lost access to someone else's bistro (removed by another member).
      if (bistroId !== ownUid && (err as { code?: string }).code === 'permission-denied') {
        loseBistro(bistroId, set, get);
      }
    },
  });
}

function detachDataListeners() {
  _unsubscribeUserData?.();
  _unsubscribeUserData = null;
  // Cancel pending empty-snapshot timers so they can't fire against the next
  // scope's freshly loaded data.
  clearPendingEmptyTimers();
  _purgedTombstoneIds.clear();
}

// Account-wide listeners: incoming recipe shares, the bistros this account can
// open, and each of those bistros' docs (names, members).
function attachSessionListeners(
  user: NonNullable<AppState['user']>,
  set: SetState,
  get: () => Store,
) {
  if (user.email) {
    _unsubscribeShares = subscribeToIncomingShares(user.email, (incomingShares) =>
      set({ incomingShares }),
    );
  }
  _unsubscribeAccess = subscribeToBistroAccess(user.uid, (access) => {
    if (access) onAccess(access, set, get);
  });
  get().refreshInvites().catch(() => {});
}

function detachSessionListeners() {
  _unsubscribeShares?.();
  _unsubscribeShares = null;
  _unsubscribeAccess?.();
  _unsubscribeAccess = null;
  _bistroUnsubs.forEach((unsub) => unsub());
  _bistroUnsubs.clear();
}

function onAccess(access: BistroAccess, set: SetState, get: () => Store) {
  const user = get().user;
  if (!user) return;

  if (access.migrated) {
    if (!get().bistroMigrated) setBistroMigrated(set, get);
  } else if (!get().bistroMigrated) {
    runMigration(set, get);
  }

  // Keep one doc listener per accessible bistro; the own bistro is implicit.
  const ids = new Set([user.uid, ...access.bistroIds]);
  for (const id of ids) {
    if (_bistroUnsubs.has(id)) continue;
    _bistroUnsubs.set(
      id,
      subscribeToBistro(
        id,
        (bistro) => {
          if (bistro) {
            set({ bistros: { ...get().bistros, [id]: bistro } });
          } else if (id === user.uid) {
            // Own bistro before it's been named or shared: its doc doesn't exist yet.
            set({ bistros: { ...get().bistros, [id]: placeholderBistro(user) } });
          } else {
            loseBistro(id, set, get);
          }
        },
        () => loseBistro(id, set, get),
      ),
    );
  }
  // Known bistros we've lost, plus a persisted active one we no longer have
  // access to — deduped, so each is handled once.
  const lost = new Set(Object.keys(get().bistros));
  const active = get().activeBistroId;
  if (active) lost.add(active);
  for (const id of lost) if (!ids.has(id)) loseBistro(id, set, get);
}

// Drops a bistro the user can no longer open: removed by another member, or
// left. If it was being viewed, fall back to the user's own bistro.
function loseBistro(id: string, set: SetState, get: () => Store) {
  const user = get().user;
  if (!user || id === user.uid) return;
  _bistroUnsubs.get(id)?.();
  _bistroUnsubs.delete(id);
  const { [id]: lost, ...rest } = get().bistros;
  set({ bistros: rest });
  clearScopeCache(user.uid, id).catch(() => {});
  if (get().activeBistroId === id) {
    // The same loss can be reported twice (access list and doc listener);
    // don't let the second, which no longer knows the name, overwrite it.
    if (!_leaving.has(id)) {
      set({ removedFromBistro: lost?.name ?? get().removedFromBistro ?? 'a bistro' });
    }
    // Don't park its data: we just cleared that cache and have lost access.
    switchScope(user.uid, false, set, get).catch(() => {});
  }
}

// Points the data listeners at another bistro, loading its parked copy (if
// any) so the switch is instant and works offline. `park` saves the bistro
// being left for next time.
async function switchScope(bistroId: string, park: boolean, set: SetState, get: () => Store) {
  const s = get();
  const user = s.user;
  const current = scopeOf(s);
  if (!user || !s.bistroMigrated || bistroId === current) return;
  const token = ++_switchToken;

  detachDataListeners();
  if (park && current) saveScopeCache(user.uid, current, pickScopeData(s)).catch(() => {});
  const data = await loadScopeCache(user.uid, bistroId);
  if (token !== _switchToken) return; // superseded by a later switch

  set({ ...data, activeBistroId: bistroId === user.uid ? null : bistroId });
  attachDataListeners(bistroId, user.uid, set, get);
}

// The account's library now lives at bistros/{uid}/…: flip the data root and
// re-point the live listeners. The loaded data is unchanged (it's a copy).
function setBistroMigrated(set: SetState, get: () => Store) {
  setDataRoot(true);
  set({ bistroMigrated: true, migration: null });
  const s = get();
  const scope = scopeOf(s);
  if (_unsubscribeUserData && s.user && scope) {
    detachDataListeners();
    attachDataListeners(scope, s.user.uid, set, get);
  }
}

// Drives the one-time copy (api/migrate-bistro.ts) round by round. The app is
// held on MigrationScreen meanwhile so nothing is written to the legacy paths
// after they've been copied.
async function runMigration(set: SetState, get: () => Store) {
  if (_migrationRunning || get().bistroMigrated) return;
  _migrationRunning = true;
  set({ migration: { status: 'running', copied: 0 } });
  try {
    // Push any queued offline writes to the legacy paths first, so the copy
    // includes them. Bounded: waitForPendingWrites never settles offline.
    await Promise.race([flushPendingWrites(), new Promise((r) => setTimeout(r, 10_000))]);
    for (let round = 0; ; round++) {
      const { done, copied } = await migrateBistroStep(round === 0);
      if (done) break;
      set({ migration: { status: 'running', copied } });
    }
    setBistroMigrated(set, get);
  } catch (err) {
    set({
      migration: {
        status: 'error',
        copied: get().migration?.copied ?? 0,
        error: err instanceof Error ? err.message : 'Could not set up your bistro.',
      },
    });
  } finally {
    _migrationRunning = false;
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
      activeBistroId: null,
      bistroMigrated: false,
      bistros: {},
      pendingInvites: [],
      migration: null,
      removedFromBistro: null,

      addRecipe: async (recipe) => {
        // userId records who added it; the bistro it lives in is the scope.
        const uid = get().user?.uid ?? '';
        const scope = scopeOf(get());
        const recipeWithUser: Recipe = { ...recipe, userId: uid };
        set((s) => ({
          recipes: [recipeWithUser, ...s.recipes],
          knownSources: s.knownSources.includes(recipeWithUser.source)
            ? s.knownSources
            : [...s.knownSources, recipeWithUser.source],
        }));
        if (scope) {
          await saveRecipe(scope, recipeWithUser);
          saveKnownSources(scope, get().knownSources);
        }
      },

      updateRecipe: async (recipe) => {
        set((s) => ({ recipes: s.recipes.map((r) => (r.id === recipe.id ? recipe : r)) }));
        const scope = scopeOf(get());
        if (scope) await saveRecipe(scope, recipe);
      },

      deleteRecipe: (id) => {
        set((s) => ({ recipes: s.recipes.filter((r) => r.id !== id) }));
        const scope = scopeOf(get());
        if (scope) deleteRecipeDoc(scope, id);
      },

      addMealEntry: (entry) => {
        const stamped: MealEntry = { ...entry, updatedAt: Date.now() };
        set((s) => ({ mealEntries: [...s.mealEntries, stamped] }));
        const scope = scopeOf(get());
        if (scope) saveMealEntry(scope, stamped);
      },

      updateMealEntry: (entry) => {
        const stamped: MealEntry = { ...entry, updatedAt: Date.now() };
        set((s) => ({
          mealEntries: s.mealEntries.map((e) => (e.id === entry.id ? stamped : e)),
        }));
        const scope = scopeOf(get());
        if (scope) saveMealEntry(scope, stamped);
      },

      deleteMealEntry: (id) => {
        set((s) => ({ mealEntries: s.mealEntries.filter((e) => e.id !== id) }));
        const scope = scopeOf(get());
        if (scope) deleteMealEntryDoc(scope, id);
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
        const scope = scopeOf(s);
        if (scope) patchShoppingItems(scope, [{ id, checked: updated.checked, checkedAt: clock }]);
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
        const scope = scopeOf(get());
        if (scope) savePantryItem(scope, stamped);
      },

      updatePantryItem: (item) => {
        const stamped: PantryItem = { ...item, updatedAt: Date.now() };
        set((s) => ({ pantryItems: s.pantryItems.map((p) => (p.id === item.id ? stamped : p)) }));
        const scope = scopeOf(get());
        if (scope) savePantryItem(scope, stamped);
      },

      removePantryItem: (id) => {
        set((s) => ({ pantryItems: s.pantryItems.filter((i) => i.id !== id) }));
        const scope = scopeOf(get());
        if (scope) deletePantryItemDoc(scope, id);
      },

      reorderPantryItems: (items) => {
        // Reordering changes only position (carried by `order`), not item
        // content, so no updatedAt bump — see stampChanged.
        const stamped = stampChanged(get().pantryItems, items, Date.now(), pantryContentEqual);
        set({ pantryItems: stamped });
        const scope = scopeOf(get());
        if (scope) savePantryItems(scope, stamped);
      },

      signIn: (firebaseUser) => {
        const existingUid = get().user?.uid;

        // If listeners are already live for this same account — the normal
        // launch path, where resubscribe() attached them from the persisted
        // session and Firebase then confirmed the same user — keep them.
        // Tearing down and re-adding the same listeners back-to-back
        // churns watch-target adds/removes on the Listen stream, the race
        // behind Firestore's fatal "INTERNAL ASSERTION FAILED (ID: ca9)"
        // (firebase-js-sdk#9267), and buys nothing.
        const keepListeners =
          _unsubscribeUserData !== null && existingUid === firebaseUser.uid;

        if (!keepListeners) {
          // Tear down any previous listeners (e.g. switching accounts)
          detachDataListeners();
          detachSessionListeners();
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
            ...EMPTY_SCOPE,
            hasGeminiApiKey: false,
            incomingShares: [],
            activeBistroId: null,
            bistroMigrated: false,
            bistros: {},
            pendingInvites: [],
            migration: null,
            removedFromBistro: null,
          }),
        });

        if (!keepListeners) {
          const s = get();
          setDataRoot(s.bistroMigrated);
          attachDataListeners(scopeOf(s)!, firebaseUser.uid, set, get);
          attachSessionListeners(s.user!, set, get);
        } else {
          // resubscribe() ran before Firebase had restored the session, so its
          // invite fetch (which needs an ID token) couldn't go out. Retry now.
          get().refreshInvites().catch(() => {});
        }
      },

      // Re-attaches Firestore listeners for a cached user without resetting
      // auth state. Called on page load when persisted auth exists so that
      // IndexedDB data is available immediately, before Firebase validates.
      resubscribe: () => {
        const s = get();
        if (!s.user || _unsubscribeUserData) return;
        setDataRoot(s.bistroMigrated);
        attachDataListeners(scopeOf(s)!, s.user.uid, set, get);
        attachSessionListeners(s.user, set, get);
      },

      signOut: async () => {
        // Tear down listeners before clearing state so no orphaned callbacks fire
        detachDataListeners();
        detachSessionListeners();
        const { user, bistros } = get();
        if (user) {
          for (const id of Object.keys(bistros)) clearScopeCache(user.uid, id).catch(() => {});
        }
        if (auth) await firebaseSignOut(auth);
        set({
          isAuthenticated: false,
          user: null,
          ...EMPTY_SCOPE,
          hasGeminiApiKey: false,
          incomingShares: [],
          activeBistroId: null,
          bistroMigrated: false,
          bistros: {},
          pendingInvites: [],
          migration: null,
          removedFromBistro: null,
        });
      },

      setSplashDone: () => set({ splashDone: true }),

      addSource: (source) => {
        set((s) => ({
          knownSources: s.knownSources.includes(source)
            ? s.knownSources
            : [...s.knownSources, source],
        }));
        const scope = scopeOf(get());
        if (scope) saveKnownSources(scope, get().knownSources);
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
        const scope = scopeOf(get());
        if (!uid || !scope) return '';
        const newId = await firestoreAcceptShare(share.id, scope, uid, share.recipe);
        set((s) => ({ incomingShares: s.incomingShares.filter((sh) => sh.id !== share.id) }));
        return newId;
      },

      dismissShare: async (shareId) => {
        await firestoreDismissShare(shareId);
        set((s) => ({ incomingShares: s.incomingShares.filter((sh) => sh.id !== shareId) }));
      },

      acceptAllShares: async () => {
        const uid = get().user?.uid;
        const scope = scopeOf(get());
        if (!uid || !scope) return;
        const shares = get().incomingShares;
        await Promise.all(
          shares.map((share) => firestoreAcceptShare(share.id, scope, uid, share.recipe)),
        );
        set({ incomingShares: [] });
      },

      dismissAllShares: async () => {
        const shares = get().incomingShares;
        await Promise.all(shares.map((share) => firestoreDismissShare(share.id)));
        set({ incomingShares: [] });
      },

      logCategoryOverride: (entry) => {
        const scope = scopeOf(get());
        if (scope) firestoreLogCategoryOverride(scope, entry);
      },

      // ── bistros ───────────────────────────────────────────────────────────

      switchBistro: (bistroId) => switchScope(bistroId, true, set, get),

      refreshInvites: async () => {
        if (!get().user) return;
        const pendingInvites = await fetchIncomingInvites();
        set({ pendingInvites });
      },

      acceptInvite: async (invite) => {
        const bistroId = await apiAcceptInvite(invite.id);
        set({ pendingInvites: get().pendingInvites.filter((i) => i.id !== invite.id) });
        return bistroId;
      },

      declineInvite: async (inviteId) => {
        await apiDeclineInvite(inviteId);
        set({ pendingInvites: get().pendingInvites.filter((i) => i.id !== inviteId) });
      },

      renameBistro: async (bistroId, name) => {
        await apiRenameBistro(bistroId, name.trim());
        const bistro = get().bistros[bistroId];
        if (bistro) set({ bistros: { ...get().bistros, [bistroId]: { ...bistro, name: name.trim() } } });
      },

      inviteMember: async (bistroId, email) => {
        await apiInviteMember(bistroId, email.trim().toLowerCase());
      },

      revokeInvite: async (inviteId) => {
        await apiRevokeInvite(inviteId);
      },

      removeMember: async (bistroId, uid) => {
        await apiRemoveMember(bistroId, uid);
      },

      leaveBistro: async (bistroId) => {
        const user = get().user;
        if (!user) return;
        _leaving.add(bistroId);
        try {
          await apiLeaveBistro(bistroId);
          if (get().activeBistroId === bistroId) await switchScope(user.uid, false, set, get);
          clearScopeCache(user.uid, bistroId).catch(() => {});
        } finally {
          _leaving.delete(bistroId);
        }
      },

      dismissRemovedNotice: () => set({ removedFromBistro: null }),

      retryMigration: () => {
        runMigration(set, get);
      },

      skipMigration: () => {
        if (get().migration?.status === 'error') set({ migration: null });
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
        // Which bistro this device is viewing, and whether the account's data
        // has moved to bistros/{uid}/…, so the offline-first boot attaches to
        // the right paths before the network has answered.
        activeBistroId: s.activeBistroId,
        bistroMigrated: s.bistroMigrated,
        bistros: s.bistros,
      }),
    },
  ),
);
