import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TOMBSTONE_RETENTION_MS,
  diffShoppingLists,
  isEffectivelyDeleted,
  mergeItem,
  nextClock,
  reconcileShoppingSnapshot,
  type ShoppingItemPatch,
} from './shoppingSync';
import { makeShoppingItem } from '../test/factories';
import type { ShoppingItem } from '../types';

/** Applies a field-masked patch the way Firestore's merge write would. */
function applyPatch(doc: ShoppingItem, patch: ShoppingItemPatch): ShoppingItem {
  const out: Record<string, unknown> = { ...doc };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete out[key];
    else out[key] = value;
  }
  return out as unknown as ShoppingItem;
}

/** Every synced field, so replicas can be compared without incidental keys. */
function syncedFields(item: ShoppingItem) {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    listType: item.listType,
    manual: item.manual,
    mealSources: item.mealSources,
    ingredientKey: item.ingredientKey,
    updatedAt: item.updatedAt,
    checked: item.checked,
    checkedAt: item.checkedAt,
    order: item.order,
    orderAt: item.orderAt,
    deleted: item.deleted,
    deletedAt: item.deletedAt,
  };
}

const base = (overrides: Partial<ShoppingItem> = {}) =>
  makeShoppingItem({
    id: 'a',
    name: 'milk',
    updatedAt: 100,
    checkedAt: 100,
    order: 0,
    orderAt: 100,
    ...overrides,
  });

describe('nextClock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the wall clock when it is ahead of everything seen', () => {
    vi.useFakeTimers({ now: 10_000 });
    expect(nextClock([base()], {})).toBe(10_000);
  });

  it('beats the newest clock seen even when the wall clock is behind', () => {
    vi.useFakeTimers({ now: 1_000 });
    const items = [base({ updatedAt: 5_000, checkedAt: 7_000, orderAt: 6_000 })];
    expect(nextClock(items, {})).toBe(7_001);
  });

  it('considers deletedAt and tombstone clocks', () => {
    vi.useFakeTimers({ now: 1_000 });
    expect(nextClock([base({ deletedAt: 8_000 })], {})).toBe(8_001);
    expect(nextClock([], { gone: 9_000 })).toBe(9_001);
  });
});

describe('isEffectivelyDeleted', () => {
  it('is false for items that were never deleted', () => {
    expect(isEffectivelyDeleted(base())).toBe(false);
    expect(isEffectivelyDeleted(base({ deleted: false, deletedAt: 500 }))).toBe(false);
  });

  it('is true when the deletion is newer than the last content edit', () => {
    expect(isEffectivelyDeleted(base({ deleted: true, deletedAt: 200 }))).toBe(true);
  });

  it('is false when content was edited after the deletion (deliberate resurrection)', () => {
    expect(isEffectivelyDeleted(base({ deleted: true, deletedAt: 200, updatedAt: 300 }))).toBe(false);
  });

  it('ignores a check-off made after the deletion', () => {
    expect(
      isEffectivelyDeleted(base({ deleted: true, deletedAt: 200, checkedAt: 300, checked: true })),
    ).toBe(true);
  });
});

describe('mergeItem', () => {
  it('takes local content when its clock is strictly newer, and patches only that group', () => {
    const incoming = base();
    const local = base({ name: 'oat milk', updatedAt: 200 });

    const { merged, patch } = mergeItem(incoming, local);

    expect(merged.name).toBe('oat milk');
    expect(merged.updatedAt).toBe(200);
    expect(patch).toMatchObject({ id: 'a', name: 'oat milk', updatedAt: 200 });
    expect(patch).not.toHaveProperty('checked');
    expect(patch).not.toHaveProperty('order');
    expect(patch).not.toHaveProperty('deleted');
  });

  it('lets the server win ties so echoed patches are absorbed', () => {
    const incoming = base({ name: 'server name' });
    const local = base({ name: 'local name' });

    const { merged, patch } = mergeItem(incoming, local);

    expect(merged.name).toBe('server name');
    expect(patch).toBeNull();
  });

  it('keeps a rename from one device and a check-off from another', () => {
    const server = base({ checked: true, checkedAt: 300 }); // checked elsewhere
    const local = base({ name: 'semi-skimmed milk', updatedAt: 200 }); // renamed here

    const { merged, patch } = mergeItem(server, local);

    expect(merged.name).toBe('semi-skimmed milk');
    expect(merged.checked).toBe(true);
    expect(patch).toMatchObject({ name: 'semi-skimmed milk' });
    expect(patch).not.toHaveProperty('checked');
  });

  it('clears content fields the winning copy lacks instead of mixing old and new', () => {
    const incoming = base({ ingredientKey: 'milk__ml', manual: true });
    const local = base({ name: 'milk', updatedAt: 200 });

    const { merged, patch } = mergeItem(incoming, local);

    expect(merged.ingredientKey).toBeUndefined();
    expect(merged.manual).toBeUndefined();
    expect(patch?.ingredientKey).toBeNull();
    expect(patch?.manual).toBeNull();
    expect(patch?.mealSources).toBeNull();
  });

  it('merges the checked, order and presence groups independently', () => {
    const incoming = base();
    const local = base({
      checked: true,
      checkedAt: 200,
      order: 5,
      orderAt: 300,
      deleted: true,
      deletedAt: 400,
    });

    const { merged, patch } = mergeItem(incoming, local);

    expect(merged).toMatchObject({ checked: true, checkedAt: 200, order: 5, orderAt: 300, deleted: true, deletedAt: 400 });
    expect(patch).toEqual({
      id: 'a',
      checked: true,
      checkedAt: 200,
      order: 5,
      orderAt: 300,
      deleted: true,
      deletedAt: 400,
    });
  });

  it('treats missing clocks as oldest', () => {
    const incoming = makeShoppingItem({ id: 'a', name: 'legacy' }); // no clocks at all
    const local = base({ name: 'stamped', updatedAt: 1 });

    expect(mergeItem(incoming, local).merged.name).toBe('stamped');
  });

  it('terminates: once the server has the patch, merging again produces nothing to send', () => {
    const server = base({ checked: true, checkedAt: 300 });
    const local = base({ name: 'renamed', updatedAt: 200, order: 3, orderAt: 250 });

    const first = mergeItem(server, local);
    expect(first.patch).not.toBeNull();

    const serverAfter = applyPatch(server, first.patch!);
    const second = mergeItem(serverAfter, first.merged);
    expect(second.patch).toBeNull();
    expect(syncedFields(second.merged)).toEqual(syncedFields(first.merged));
  });

  it('converges to the same state whichever replica merges first', () => {
    const a = base({ name: 'A rename', updatedAt: 500, checked: false, checkedAt: 150, order: 1, orderAt: 600 });
    const b = base({ name: 'B rename', updatedAt: 400, checked: true, checkedAt: 700, order: 9, orderAt: 200, deleted: true, deletedAt: 450 });

    const aSeesB = mergeItem(b, a).merged;
    const bSeesA = mergeItem(a, b).merged;

    expect(syncedFields(aSeesB)).toEqual(syncedFields(bSeesA));
    expect(aSeesB).toMatchObject({ name: 'A rename', checked: true, order: 1, deleted: true });
    // The deletion predates A's rename, so the item is alive on both replicas.
    expect(isEffectivelyDeleted(aSeesB)).toBe(false);
  });
});

describe('diffShoppingLists', () => {
  const CLOCK = 1_000;

  it('stamps every clock on a newly added item and emits a full patch', () => {
    const added = makeShoppingItem({ id: 'new', name: 'eggs' });

    const { items, patches } = diffShoppingLists([], [added], CLOCK, {});

    expect(items[0]).toMatchObject({ order: 0, updatedAt: CLOCK, checkedAt: CLOCK, orderAt: CLOCK });
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({
      id: 'new',
      name: 'eggs',
      checked: false,
      checkedAt: CLOCK,
      order: 0,
      orderAt: CLOCK,
      updatedAt: CLOCK,
    });
    expect(patches[0]).not.toHaveProperty('deleted');
  });

  it('emits no patch for an untouched item', () => {
    const item = base();
    const { items, patches } = diffShoppingLists([item], [{ ...item }], CLOCK, {});

    expect(patches).toEqual([]);
    expect(items[0].updatedAt).toBe(100);
  });

  it('stamps only the checked group on a check-off', () => {
    const item = base();

    const { items, patches } = diffShoppingLists([item], [{ ...item, checked: true }], CLOCK, {});

    expect(items[0]).toMatchObject({ checked: true, checkedAt: CLOCK, updatedAt: 100, orderAt: 100 });
    expect(patches).toEqual([{ id: 'a', checked: true, checkedAt: CLOCK }]);
  });

  it('stamps the content group on a rename, clearing absent optional fields', () => {
    const item = base();

    const { items, patches } = diffShoppingLists([item], [{ ...item, name: 'oat milk' }], CLOCK, {});

    expect(items[0].updatedAt).toBe(CLOCK);
    expect(patches).toEqual([
      {
        id: 'a',
        name: 'oat milk',
        category: 'Dairy & Eggs',
        listType: null,
        manual: null,
        mealSources: null,
        ingredientKey: null,
        updatedAt: CLOCK,
      },
    ]);
  });

  it('only bumps orderAt for items whose position actually moved', () => {
    const a = base({ id: 'a', order: 0 });
    const b = base({ id: 'b', order: 1 });
    const c = base({ id: 'c', order: 2 });

    const { items, patches } = diffShoppingLists([a, b, c], [b, a, c], CLOCK, {});

    expect(items.map((i) => [i.id, i.order, i.orderAt])).toEqual([
      ['b', 0, CLOCK],
      ['a', 1, CLOCK],
      ['c', 2, 100],
    ]);
    expect(patches.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('turns removed items into tombstones', () => {
    const a = base({ id: 'a' });
    const b = base({ id: 'b', order: 1 });

    const { items, patches, tombstones } = diffShoppingLists([a, b], [a], CLOCK, {});

    expect(items.map((i) => i.id)).toEqual(['a']);
    expect(patches).toEqual([{ id: 'b', deleted: true, deletedAt: CLOCK }]);
    expect(tombstones).toEqual({ b: CLOCK });
  });

  it('explicitly undeletes a re-added tombstoned item (undo of a delete)', () => {
    const restored = base({ id: 'a' });

    const { items, patches, tombstones } = diffShoppingLists([], [restored], CLOCK, { a: 500 });

    expect(items[0]).toMatchObject({ deleted: false, deletedAt: CLOCK });
    expect(patches[0]).toMatchObject({ deleted: false, deletedAt: CLOCK });
    expect(tombstones).toEqual({});
  });

  it('takes clocks from the current state, not the caller’s possibly stale copy', () => {
    const current = base({ updatedAt: 900, checkedAt: 900, orderAt: 900 });
    const staleUndoCopy = { ...current, updatedAt: 1, checkedAt: 1, orderAt: 1 };

    const { items, patches } = diffShoppingLists([current], [staleUndoCopy], CLOCK, {});

    expect(items[0]).toMatchObject({ updatedAt: 900, checkedAt: 900, orderAt: 900 });
    expect(patches).toEqual([]);
  });

  it('does not mutate the tombstones it was given', () => {
    const input = { old: 1 };
    diffShoppingLists([base()], [], CLOCK, input);
    expect(input).toEqual({ old: 1 });
  });
});

describe('reconcileShoppingSnapshot', () => {
  const NOW = 10 * TOMBSTONE_RETENTION_MS;

  it('takes server-only items as-is', () => {
    const server = base({ id: 'x' });
    const result = reconcileShoppingSnapshot([server], [], {}, NOW);

    expect(result.items).toEqual([server]);
    expect(result.resend).toEqual([]);
  });

  it('hides tombstoned server docs and records them locally', () => {
    const server = base({ deleted: true, deletedAt: 200 });
    const result = reconcileShoppingSnapshot([server], [], {}, NOW - TOMBSTONE_RETENTION_MS + 1_000);

    expect(result.items).toEqual([]);
    expect(result.tombstones).toEqual({ a: 200 });
  });

  it('does not resurrect a cleared item when a stale check-off arrives', () => {
    const server = base({ deleted: true, deletedAt: 200 });
    const local = base({ checked: true, checkedAt: 300 });

    const result = reconcileShoppingSnapshot([server], [local], {}, 1_000);

    expect(result.items).toEqual([]);
    expect(result.resend).toEqual([{ id: 'a', checked: true, checkedAt: 300 }]);
  });

  it('resurrects a cleared item when it was renamed after the deletion', () => {
    const server = base({ deleted: true, deletedAt: 200 });
    const local = base({ name: 'whole milk', updatedAt: 300 });

    const result = reconcileShoppingSnapshot([server], [local], {}, 1_000);

    expect(result.items.map((i) => i.name)).toEqual(['whole milk']);
  });

  it('reasserts a local deletion the server has not heard about', () => {
    const server = base();

    const result = reconcileShoppingSnapshot([server], [], { a: 500 }, 1_000);

    expect(result.items).toEqual([]);
    expect(result.tombstones).toEqual({ a: 500 });
    expect(result.resend).toEqual([{ id: 'a', deleted: true, deletedAt: 500 }]);
  });

  it('lets a content edit newer than the local deletion win', () => {
    const server = base({ name: 'edited elsewhere', updatedAt: 600 });

    const result = reconcileShoppingSnapshot([server], [], { a: 500 }, 1_000);

    expect(result.items.map((i) => i.name)).toEqual(['edited elsewhere']);
    expect(result.resend).toEqual([]);
  });

  it('purges tombstones older than the retention window', () => {
    const stale = base({ id: 'old', deleted: true, deletedAt: NOW - TOMBSTONE_RETENTION_MS - 1 });
    const fresh = base({ id: 'new', deleted: true, deletedAt: NOW - 1 });

    const result = reconcileShoppingSnapshot([stale, fresh], [], {}, NOW);

    expect(result.purgeIds).toEqual(['old']);
  });

  it('drops docs and local items with a falsy id', () => {
    const ghost = base({ id: '' });

    const result = reconcileShoppingSnapshot([ghost], [ghost], {}, 1_000);

    expect(result.items).toEqual([]);
    expect(result.resend).toEqual([]);
  });

  it('re-pushes a recent local-only item whose queued add was lost', () => {
    const local = base({ id: 'lost', updatedAt: NOW - 1_000 });

    const result = reconcileShoppingSnapshot([], [local], {}, NOW);

    expect(result.items).toEqual([local]);
    expect(result.resend).toHaveLength(1);
    expect(result.resend[0]).toMatchObject({ id: 'lost', name: 'milk' });
  });

  it('drops local-only items too old or never stamped', () => {
    const ancient = base({
      id: 'ancient',
      updatedAt: 1,
      checkedAt: 1,
      orderAt: 1,
    });
    const unstamped = makeShoppingItem({ id: 'unstamped' });

    const result = reconcileShoppingSnapshot([], [ancient, unstamped], {}, NOW);

    expect(result.items).toEqual([]);
    expect(result.resend).toEqual([]);
  });

  it('carries forward local tombstones within retention and prunes older ones', () => {
    const result = reconcileShoppingSnapshot(
      [],
      [],
      { recent: NOW - 1_000, expired: NOW - TOMBSTONE_RETENTION_MS - 1 },
      NOW,
    );

    expect(result.tombstones).toEqual({ recent: NOW - 1_000 });
  });

  it('sorts items by order, with unordered items last', () => {
    const items = [
      base({ id: 'none', order: undefined }),
      base({ id: 'two', order: 2 }),
      base({ id: 'zero', order: 0 }),
    ];

    const result = reconcileShoppingSnapshot(items, [], {}, 1_000);

    expect(result.items.map((i) => i.id)).toEqual(['zero', 'two', 'none']);
  });
});
