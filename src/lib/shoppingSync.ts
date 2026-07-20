import type { ShoppingItem } from '../types';

// Conflict-free sync model for the shopping list.
//
// The previous sync wrote whole documents (setDoc without merge) and whole
// lists (batch rewrites of every doc), and hard-deleted docs. Firestore
// resolves concurrent writes by arrival order, so a device coming back online
// replayed its queued stale documents over everything the other device had
// done in the meantime — including fields it never touched — and recreated
// docs the other device had deleted. That is exactly the "my latest changes
// got overridden" failure, worst when the two devices are online at different
// times, because the old client-side repair only worked while the losing
// device was subscribed at that moment.
//
// This module replaces that with a per-field-group LWW (last-writer-wins)
// merge — a small state-based CRDT:
//
//  • An item's fields are split into independent groups, each with its own
//    clock: content (name/category/manual/mealSources/ingredientKey →
//    `updatedAt`), checked (→ `checkedAt`), order (→ `orderAt`) and presence
//    (`deleted` → `deletedAt`).
//  • Every write is a field-masked patch ({ merge: true }) carrying only the
//    groups that actually changed, so a replayed offline queue can no longer
//    clobber fields it didn't touch: a rename on device A and a check-off on
//    device B both survive, whatever order they reach the server.
//  • Merging picks each group from the side with the newer clock; the
//    incoming (server) side wins ties, so a resent patch that echoes back
//    ties and is absorbed — convergence terminates, no write loops. Both
//    devices deterministically converge to the same list regardless of who
//    syncs first.
//  • Deletes are soft tombstones (`deleted: true` + `deletedAt`), so a stale
//    queued write merges into a doc that is still known-deleted instead of
//    resurrecting it. An item is only *effectively* deleted while the
//    deletion is newer than its last content edit — re-adding or renaming
//    after (unaware of) a deletion deliberately brings it back, while a mere
//    check-off of a since-cleared item does not. Tombstoned docs are
//    hard-deleted after TOMBSTONE_RETENTION_MS.
//  • Clocks are epoch-ms hybrid logical clocks: a new stamp is
//    max(Date.now(), newest clock ever seen + 1), so an edit made after
//    seeing the current state always outranks it even if this device's wall
//    clock is behind the other's.

export const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// A field-masked write for one item. `null` means "clear this field on the
// server" (translated to deleteField() at the Firestore layer); absent fields
// are left untouched by the merge write.
export type ShoppingItemPatch = { id: string } & {
  [K in Exclude<keyof ShoppingItem, 'id'>]?: ShoppingItem[K] | null;
};

/** Next hybrid-logical-clock stamp: beats every clock this device has seen. */
export function nextClock(
  items: ShoppingItem[],
  tombstones: Record<string, number>,
): number {
  let maxSeen = 0;
  for (const i of items) {
    maxSeen = Math.max(
      maxSeen,
      i.updatedAt ?? 0,
      i.checkedAt ?? 0,
      i.orderAt ?? 0,
      i.deletedAt ?? 0,
    );
  }
  for (const t of Object.values(tombstones)) maxSeen = Math.max(maxSeen, t);
  return Math.max(Date.now(), maxSeen + 1);
}

/**
 * Whether the item should be hidden as deleted. A content edit stamped after
 * the deletion wins over it (deliberate resurrection); a checked toggle does
 * not — checking off an item that was cleared elsewhere shouldn't revive it.
 */
export function isEffectivelyDeleted(item: ShoppingItem): boolean {
  return item.deleted === true && (item.deletedAt ?? 0) > (item.updatedAt ?? 0);
}

const contentEqual = (a: ShoppingItem, b: ShoppingItem): boolean =>
  a.name === b.name &&
  a.category === b.category &&
  (a.manual ?? false) === (b.manual ?? false) &&
  (a.ingredientKey ?? '') === (b.ingredientKey ?? '') &&
  JSON.stringify(a.mealSources ?? null) === JSON.stringify(b.mealSources ?? null);

// Content-group fields are always patched together (with `null` clearing
// fields the winning copy doesn't carry), so the receiving doc ends up with
// exactly the winner's content — never a mix of old and new optional fields.
function setContentPatch(patch: ShoppingItemPatch, item: ShoppingItem): void {
  patch.name = item.name;
  patch.category = item.category;
  patch.manual = item.manual ?? null;
  patch.mealSources = item.mealSources ?? null;
  patch.ingredientKey = item.ingredientKey ?? null;
  patch.updatedAt = item.updatedAt ?? 0;
}

function copyContent(from: ShoppingItem, into: ShoppingItem): ShoppingItem {
  return {
    ...into,
    name: from.name,
    category: from.category,
    manual: from.manual,
    mealSources: from.mealSources,
    ingredientKey: from.ingredientKey,
    updatedAt: from.updatedAt,
  };
}

function fullPatch(item: ShoppingItem): ShoppingItemPatch {
  const patch: ShoppingItemPatch = {
    id: item.id,
    checked: item.checked,
    checkedAt: item.checkedAt ?? 0,
    order: item.order ?? null,
    orderAt: item.orderAt ?? 0,
  };
  setContentPatch(patch, item);
  if (item.deleted !== undefined) {
    patch.deleted = item.deleted;
    patch.deletedAt = item.deletedAt ?? 0;
  }
  return patch;
}

/**
 * Merges the server copy of an item with the local copy, group by group.
 * Local wins a group only with a strictly newer clock (server wins ties, so
 * resent patches echoing back are absorbed and convergence terminates). When
 * local wins any group, a patch carrying exactly those groups is returned so
 * the server catches up.
 */
export function mergeItem(
  incoming: ShoppingItem,
  local: ShoppingItem,
): { merged: ShoppingItem; patch: ShoppingItemPatch | null } {
  let merged: ShoppingItem = { ...incoming };
  let patch: ShoppingItemPatch | null = null;
  const ensure = (): ShoppingItemPatch => (patch ??= { id: incoming.id });

  if ((local.updatedAt ?? 0) > (incoming.updatedAt ?? 0)) {
    merged = copyContent(local, merged);
    setContentPatch(ensure(), local);
  }
  if ((local.checkedAt ?? 0) > (incoming.checkedAt ?? 0)) {
    merged.checked = local.checked;
    merged.checkedAt = local.checkedAt;
    const p = ensure();
    p.checked = local.checked;
    p.checkedAt = local.checkedAt;
  }
  if ((local.orderAt ?? 0) > (incoming.orderAt ?? 0)) {
    merged.order = local.order;
    merged.orderAt = local.orderAt;
    const p = ensure();
    p.order = local.order ?? null;
    p.orderAt = local.orderAt;
  }
  if ((local.deletedAt ?? 0) > (incoming.deletedAt ?? 0)) {
    merged.deleted = local.deleted;
    merged.deletedAt = local.deletedAt;
    const p = ensure();
    p.deleted = local.deleted ?? false;
    p.deletedAt = local.deletedAt;
  }
  return { merged, patch };
}

/**
 * Diffs a UI-produced next list against the current local list and returns
 * the new local state plus the minimal field-masked patches to persist it:
 * full docs for (re-)added items, changed groups only for edited items, and
 * tombstone patches for removed items. `order` is normalised to the array
 * index, but `orderAt` is only bumped for items whose position actually
 * changed, so an untouched item can never lose an order conflict it isn't
 * part of. Clocks always come from the current local state (`prev`), not the
 * caller's copies, which may be stale (e.g. undo history).
 */
export function diffShoppingLists(
  prev: ShoppingItem[],
  next: ShoppingItem[],
  clock: number,
  tombstones: Record<string, number>,
): {
  items: ShoppingItem[];
  patches: ShoppingItemPatch[];
  tombstones: Record<string, number>;
} {
  const prevById = new Map(prev.map((i) => [i.id, i]));
  const nextIds = new Set(next.map((i) => i.id));
  const patches: ShoppingItemPatch[] = [];
  const outTombstones: Record<string, number> = { ...tombstones };

  const items = next.map((raw, index) => {
    const before = prevById.get(raw.id);

    if (!before) {
      // (Re-)added item: stamp every group fresh. If the id was tombstoned
      // (undo of a delete), explicitly undelete it.
      const wasTombstoned = outTombstones[raw.id] !== undefined;
      delete outTombstones[raw.id];
      const item: ShoppingItem = {
        ...raw,
        order: index,
        updatedAt: clock,
        checkedAt: clock,
        orderAt: clock,
        ...(wasTombstoned && { deleted: false, deletedAt: clock }),
      };
      patches.push(fullPatch(item));
      return item;
    }

    // Existing item: take content from the caller, clocks/baseline from the
    // store copy, and stamp only the groups that actually changed.
    const item: ShoppingItem = {
      ...raw,
      order: before.order,
      updatedAt: before.updatedAt,
      checkedAt: before.checkedAt,
      orderAt: before.orderAt,
      deleted: before.deleted,
      deletedAt: before.deletedAt,
    };
    let patch: ShoppingItemPatch | null = null;
    const ensure = (): ShoppingItemPatch => (patch ??= { id: raw.id });

    if (!contentEqual(before, raw)) {
      item.updatedAt = clock;
      setContentPatch(ensure(), item);
    }
    if (before.checked !== raw.checked) {
      item.checkedAt = clock;
      const p = ensure();
      p.checked = raw.checked;
      p.checkedAt = clock;
    }
    if (before.order !== index) {
      item.order = index;
      item.orderAt = clock;
      const p = ensure();
      p.order = index;
      p.orderAt = clock;
    }
    if (patch) patches.push(patch);
    return item;
  });

  for (const old of prev) {
    if (nextIds.has(old.id)) continue;
    outTombstones[old.id] = clock;
    patches.push({ id: old.id, deleted: true, deletedAt: clock });
  }

  return { items, patches, tombstones: outTombstones };
}

/**
 * Reconciles an incoming Firestore snapshot (raw docs, tombstones included)
 * with the local live items and local tombstone knowledge. Returns the new
 * local state, patches to resend for every group the local side won, and the
 * ids of long-dead tombstones safe to hard-delete.
 */
export function reconcileShoppingSnapshot(
  incoming: ShoppingItem[],
  localItems: ShoppingItem[],
  localTombstones: Record<string, number>,
  now: number,
): {
  items: ShoppingItem[];
  tombstones: Record<string, number>;
  resend: ShoppingItemPatch[];
  purgeIds: string[];
} {
  const localById = new Map(localItems.map((i) => [i.id, i]));
  const seen = new Set<string>();
  const items: ShoppingItem[] = [];
  const tombstones: Record<string, number> = {};
  const resend: ShoppingItemPatch[] = [];
  const purgeIds: string[] = [];

  for (const inc of incoming) {
    seen.add(inc.id);
    const local = localById.get(inc.id);
    const localTombstone = localTombstones[inc.id];
    let merged: ShoppingItem;

    if (local) {
      const result = mergeItem(inc, local);
      merged = result.merged;
      if (result.patch) resend.push(result.patch);
    } else if (
      localTombstone !== undefined &&
      localTombstone > (inc.deletedAt ?? 0) &&
      localTombstone > (inc.updatedAt ?? 0)
    ) {
      // We deleted this item and the server doc doesn't know yet (e.g. the
      // delete was queued offline and the queue was lost). Reassert it —
      // unless the incoming copy carries a content edit newer than our
      // deletion, which wins and resurrects the item.
      merged = { ...inc, deleted: true, deletedAt: localTombstone };
      resend.push({ id: inc.id, deleted: true, deletedAt: localTombstone });
    } else {
      merged = inc;
    }

    if (isEffectivelyDeleted(merged)) {
      const deletedAt = merged.deletedAt ?? 0;
      tombstones[merged.id] = deletedAt;
      if (now - deletedAt > TOMBSTONE_RETENTION_MS) purgeIds.push(merged.id);
    } else {
      items.push(merged);
    }
  }

  // Items only known locally. With tombstones, a deletion elsewhere shows up
  // as an explicit deleted doc — absence means the server (and the local
  // Firestore cache, which replays pending writes into snapshots) has never
  // seen the item, i.e. the queued add was lost. Re-push it rather than drop
  // it, as long as it was touched recently enough that it can't be a stray
  // predating an already-purged tombstone.
  for (const local of localItems) {
    if (seen.has(local.id)) continue;
    const newest = Math.max(
      local.updatedAt ?? 0,
      local.checkedAt ?? 0,
      local.orderAt ?? 0,
    );
    if (newest > 0 && now - newest < TOMBSTONE_RETENTION_MS) {
      items.push(local);
      resend.push(fullPatch(local));
    }
  }

  // Carry forward local tombstone knowledge for docs not in this snapshot
  // (already hard-deleted server-side), pruning entries past retention.
  for (const [id, deletedAt] of Object.entries(localTombstones)) {
    if (seen.has(id) || tombstones[id] !== undefined) continue;
    if (now - deletedAt < TOMBSTONE_RETENTION_MS) tombstones[id] = deletedAt;
  }

  items.sort(
    (a, b) =>
      (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER),
  );

  return { items, tombstones, resend, purgeIds };
}
