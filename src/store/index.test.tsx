import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makePantryItem, makeRecipe, makeShoppingItem } from '../test/factories';

// The store talks to Firestore only through lib/firestore, so mocking that
// module (see lib/__mocks__) isolates it completely. lib/firebase needs no
// mock: without VITE_FIREBASE_* env it exports auth/db as null.
vi.mock('../lib/firestore');
vi.mock('../lib/idbStorage');

const firestore = await import('../lib/firestore');
const { useStore } = await import('./index');

const initialState = useStore.getState();
const USER = { uid: 'user-1', name: 'Cheryl', email: 'cheryl@example.com' };
const NOW = 1_000_000;

const signedIn = () => useStore.setState({ user: USER, isAuthenticated: true });

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  useStore.setState(initialState, true);
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('recipes', () => {
  it('adds a recipe owned by the signed-in user, records its source and saves it', async () => {
    signedIn();

    await useStore.getState().addRecipe(makeRecipe({ id: 'r1', source: 'Nigella' }));

    const { recipes, knownSources } = useStore.getState();
    expect(recipes).toHaveLength(1);
    expect(recipes[0].userId).toBe('user-1');
    expect(knownSources).toEqual(['Nigella']);
    expect(firestore.saveRecipe).toHaveBeenCalledWith('user-1', expect.objectContaining({ id: 'r1' }));
    expect(firestore.saveKnownSources).toHaveBeenCalledWith('user-1', ['Nigella']);
  });

  it('puts new recipes first and does not duplicate known sources', async () => {
    await useStore.getState().addRecipe(makeRecipe({ id: 'r1', source: 'Nigella' }));
    await useStore.getState().addRecipe(makeRecipe({ id: 'r2', source: 'Nigella' }));

    expect(useStore.getState().recipes.map((r) => r.id)).toEqual(['r2', 'r1']);
    expect(useStore.getState().knownSources).toEqual(['Nigella']);
  });

  it('works offline-first without touching Firestore when signed out', async () => {
    await useStore.getState().addRecipe(makeRecipe());
    useStore.getState().deleteRecipe('recipe-1');

    expect(useStore.getState().recipes).toEqual([]);
    expect(firestore.saveRecipe).not.toHaveBeenCalled();
    expect(firestore.deleteRecipeDoc).not.toHaveBeenCalled();
  });

  it('updates and deletes recipes', async () => {
    signedIn();
    useStore.setState({ recipes: [makeRecipe({ id: 'r1', title: 'Old' })] });

    await useStore.getState().updateRecipe(makeRecipe({ id: 'r1', title: 'New' }));
    expect(useStore.getState().recipes[0].title).toBe('New');

    useStore.getState().deleteRecipe('r1');
    expect(useStore.getState().recipes).toEqual([]);
    expect(firestore.deleteRecipeDoc).toHaveBeenCalledWith('user-1', 'r1');
  });
});

describe('meal entries', () => {
  it('stamps updatedAt on add and update', () => {
    signedIn();
    const entry = { id: 'm1', date: '2026-03-18', type: 'custom' as const, customTitle: 'Tacos', servings: 2 };

    useStore.getState().addMealEntry(entry);
    expect(useStore.getState().mealEntries[0].updatedAt).toBe(NOW);

    vi.setSystemTime(NOW + 5);
    useStore.getState().updateMealEntry({ ...entry, servings: 4 });
    expect(useStore.getState().mealEntries[0]).toMatchObject({ servings: 4, updatedAt: NOW + 5 });
    expect(firestore.saveMealEntry).toHaveBeenCalledTimes(2);
  });

  it('deletes entries', () => {
    signedIn();
    useStore.setState({ mealEntries: [{ id: 'm1', date: '2026-03-18', type: 'custom', servings: 2 }] });

    useStore.getState().deleteMealEntry('m1');

    expect(useStore.getState().mealEntries).toEqual([]);
    expect(firestore.deleteMealEntryDoc).toHaveBeenCalledWith('user-1', 'm1');
  });
});

describe('shopping list', () => {
  const item = (id: string, order: number, overrides = {}) =>
    makeShoppingItem({ id, name: id, order, updatedAt: 100, checkedAt: 100, orderAt: 100, ...overrides });

  it('toggles an item by patching only the checked group', () => {
    signedIn();
    useStore.setState({ shoppingItems: [item('milk', 0)] });

    useStore.getState().toggleShoppingItem('milk');

    expect(useStore.getState().shoppingItems[0]).toMatchObject({ checked: true, checkedAt: NOW, updatedAt: 100 });
    expect(firestore.patchShoppingItems).toHaveBeenCalledWith('user-1', [
      { id: 'milk', checked: true, checkedAt: NOW },
    ]);
  });

  it('ignores toggling an unknown item', () => {
    signedIn();
    useStore.getState().toggleShoppingItem('nope');
    expect(firestore.patchShoppingItems).not.toHaveBeenCalled();
  });

  it('adds an item with fresh clocks and a full patch', () => {
    signedIn();
    useStore.getState().addShoppingItem(makeShoppingItem({ id: 'eggs', name: 'eggs' }));

    expect(useStore.getState().shoppingItems[0]).toMatchObject({ id: 'eggs', order: 0, updatedAt: NOW });
    expect(firestore.patchShoppingItems).toHaveBeenCalledWith('user-1', [
      expect.objectContaining({ id: 'eggs', name: 'eggs', updatedAt: NOW }),
    ]);
  });

  it('removes an item by tombstoning it', () => {
    signedIn();
    useStore.setState({ shoppingItems: [item('milk', 0), item('bread', 1)] });

    useStore.getState().removeShoppingItem('milk');

    const state = useStore.getState();
    expect(state.shoppingItems.map((i) => i.id)).toEqual(['bread']);
    expect(state.shoppingTombstones).toEqual({ milk: NOW });
    expect(firestore.patchShoppingItems).toHaveBeenCalledWith(
      'user-1',
      expect.arrayContaining([{ id: 'milk', deleted: true, deletedAt: NOW }]),
    );
  });

  it('reorders by stamping only the items that moved', () => {
    signedIn();
    const [a, b, c] = [item('a', 0), item('b', 1), item('c', 2)];
    useStore.setState({ shoppingItems: [a, b, c] });

    useStore.getState().reorderShoppingItems([b, a, c]);

    const patches = vi.mocked(firestore.patchShoppingItems).mock.calls[0][1];
    expect(patches.map((p) => p.id)).toEqual(['b', 'a']);
    expect(useStore.getState().shoppingItems.find((i) => i.id === 'c')?.orderAt).toBe(100);
  });

  it('clears all checked items in one batch', () => {
    signedIn();
    useStore.setState({
      shoppingItems: [item('a', 0, { checked: true }), item('b', 1), item('c', 2, { checked: true })],
    });

    useStore.getState().clearCheckedItems();

    expect(useStore.getState().shoppingItems.map((i) => i.id)).toEqual(['b']);
    expect(Object.keys(useStore.getState().shoppingTombstones).sort()).toEqual(['a', 'c']);
    expect(firestore.patchShoppingItems).toHaveBeenCalledTimes(1);
  });

  it('issues stamps that beat clocks from a device whose wall clock is ahead', () => {
    useStore.setState({ shoppingItems: [item('milk', 0, { updatedAt: NOW + 50_000 })] });

    useStore.getState().toggleShoppingItem('milk');

    expect(useStore.getState().shoppingItems[0].checkedAt).toBe(NOW + 50_001);
  });

  it('keeps the list locally when signed out', () => {
    useStore.getState().addShoppingItem(makeShoppingItem({ id: 'eggs' }));

    expect(useStore.getState().shoppingItems).toHaveLength(1);
    expect(firestore.patchShoppingItems).not.toHaveBeenCalled();
  });
});

describe('pantry', () => {
  it('adds, updates and removes cupboard items', () => {
    signedIn();

    useStore.getState().addPantryItem(makePantryItem({ id: 'p1', name: 'salt' }));
    expect(useStore.getState().pantryItems[0].updatedAt).toBe(NOW);
    expect(firestore.savePantryItem).toHaveBeenCalledTimes(1);

    useStore.getState().updatePantryItem(makePantryItem({ id: 'p1', name: 'sea salt' }));
    expect(useStore.getState().pantryItems[0].name).toBe('sea salt');

    useStore.getState().removePantryItem('p1');
    expect(useStore.getState().pantryItems).toEqual([]);
    expect(firestore.deletePantryItemDoc).toHaveBeenCalledWith('user-1', 'p1');
  });

  it('reorders without bumping updatedAt, since only position changed', () => {
    signedIn();
    const a = makePantryItem({ id: 'a', order: 0, updatedAt: 5 });
    const b = makePantryItem({ id: 'b', name: 'pepper', order: 1, updatedAt: 5 });
    useStore.setState({ pantryItems: [a, b] });

    useStore.getState().reorderPantryItems([
      { ...b, order: 0 },
      { ...a, order: 1 },
    ]);

    const pantry = useStore.getState().pantryItems;
    expect(pantry.map((p) => [p.id, p.updatedAt])).toEqual([
      ['b', 5],
      ['a', 5],
    ]);
    expect(firestore.savePantryItems).toHaveBeenCalledTimes(1);
  });
});

describe('sources', () => {
  it('adds a source once', () => {
    signedIn();
    useStore.getState().addSource('BBC Good Food');
    useStore.getState().addSource('BBC Good Food');

    expect(useStore.getState().knownSources).toEqual(['BBC Good Food']);
    expect(firestore.saveKnownSources).toHaveBeenLastCalledWith('user-1', ['BBC Good Food']);
  });
});
