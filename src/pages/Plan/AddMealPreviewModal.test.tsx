import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddMealPreviewModal } from './AddMealPreviewModal';
import { useStore } from '../../store';
import { mergeIntoShoppingList } from '../../lib/ingredients';
import type { ShoppingItem } from '../../types';
import { makeIngredient, makeMealEntry, makePantryItem, makeRecipe, makeShoppingItem } from '../../test/factories';

vi.mock('../../lib/firestore');
vi.mock('../../lib/idbStorage');

const initialState = useStore.getState();
const entry = makeMealEntry({ id: 'm1', recipeId: 'r1', servings: 4 });
// Serves 2, planned for 4: everything doubles.
const recipe = makeRecipe({
  id: 'r1',
  title: 'Pasta',
  servings: 2,
  ingredients: [
    makeIngredient({ name: 'olive oil', quantity: 2, unit: 'tbsp' }),
    makeIngredient({ name: 'garlic', quantity: 2, unit: '' }),
    makeIngredient({ name: 'spaghetti', quantity: 200, unit: 'g' }),
  ],
});
const oil = makePantryItem({ name: 'oil', normalizedName: 'oil' });

beforeEach(() => {
  useStore.setState(initialState, true);
  useStore.setState({ recipes: [recipe], pantryItems: [oil] });
});

function renderModal() {
  const onClose = vi.fn();
  render(<MemoryRouter><AddMealPreviewModal entry={entry} recipe={recipe} onClose={onClose} /></MemoryRouter>);
  return { onClose };
}

const list = () => useStore.getState().shoppingItems;
const names = () => list().map((i) => i.name);

describe('AddMealPreviewModal', () => {
  it('lists what will be added, ticked, and the cupboard staples unticked', () => {
    renderModal();

    expect(screen.getByRole('checkbox', { name: '4 garlic' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '400 g spaghetti' })).toBeChecked();
    const staple = screen.getByRole('checkbox', { name: '4 tbsp olive oil' });
    expect(staple).not.toBeChecked();
    expect(staple).toHaveAccessibleDescription('Cupboard: oil');
    expect(screen.getByRole('button', { name: 'Add (2)' })).toBeEnabled();
  });

  it('adds the same as a plain add when nothing is changed', async () => {
    const { onClose } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Add (2)' }));

    const plain = mergeIntoShoppingList([], recipe.ingredients, {
      scale: 2, mealEntryId: 'm1', recipeTitle: 'Pasta', pantryItems: [oil],
    });
    const shape = ({ name, category, checked, mealSources, ingredientKey }: ShoppingItem) =>
      ({ name, category, checked, mealSources, ingredientKey });
    expect(list().map(shape)).toEqual(plain.map(shape));
    expect(onClose).toHaveBeenCalled();
  });

  it('leaves off unticked items and adds ticked cupboard staples', async () => {
    renderModal();

    await userEvent.click(screen.getByRole('checkbox', { name: '4 garlic' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /olive oil/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Add (2)' }));

    expect(names()).toEqual(['4 tbsp olive oil', '400 g spaghetti']);
    expect(list()[0].mealSources).toEqual([expect.objectContaining({ mealEntryId: 'm1' })]);
  });

  it('cannot add with everything unticked', async () => {
    renderModal();

    await userEvent.click(screen.getByRole('checkbox', { name: '4 garlic' }));
    await userEvent.click(screen.getByRole('checkbox', { name: '400 g spaghetti' }));

    expect(screen.getByRole('button', { name: 'Add (0)' })).toBeDisabled();
  });

  it('does not skip a cupboard item marked out of stock', () => {
    useStore.setState({ pantryItems: [{ ...oil, inStock: false }] });
    renderModal();

    expect(screen.getByRole('checkbox', { name: '4 tbsp olive oil' })).toBeChecked();
    expect(screen.queryByText(/In store cupboard/)).not.toBeInTheDocument();
  });

  it('shows the total when an item folds into one already on the list', () => {
    useStore.setState({
      shoppingItems: [makeShoppingItem({
        id: 's1', name: '100 g spaghetti', ingredientKey: 'spaghetti',
        mealSources: [{ mealEntryId: 'm0', recipeTitle: 'Bolognese', scaledQuantity: 100, unit: 'g', ingredientName: 'spaghetti' }],
      })],
    });
    renderModal();

    const row = screen.getByRole('checkbox', { name: '500 g spaghetti' });
    expect(row).toBeChecked();
    expect(row).toHaveAccessibleDescription('Adds to 100 g spaghetti');
  });

  it('offers only what is not on the list yet when opened again', async () => {
    renderModal();
    await userEvent.click(screen.getByRole('checkbox', { name: '4 garlic' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add (1)' }));

    // The sheet is still mounted and now reads the updated list.
    expect(screen.getByRole('checkbox', { name: '4 garlic' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /spaghetti/ })).not.toBeInTheDocument();
  });

  it("says when everything's already on the list", async () => {
    useStore.setState({
      shoppingItems: mergeIntoShoppingList([], recipe.ingredients, {
        scale: 2, mealEntryId: 'm1', recipeTitle: 'Pasta', keepPantryKeys: new Set(['olive oil']), pantryItems: [oil],
      }),
    });
    renderModal();

    expect(screen.getByText("Everything's already on the list.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add (0)' })).toBeDisabled();
  });

  it('keeps changes synced in while the sheet was open', async () => {
    renderModal();
    // Another member adds milk while the sheet is open.
    useStore.setState({ shoppingItems: [makeShoppingItem({ id: 'x', name: 'milk', ingredientKey: 'milk' })] });

    await userEvent.click(screen.getByRole('button', { name: 'Add (2)' }));

    expect(names()).toEqual(['milk', '4 garlic', '400 g spaghetti']);
  });

  it('changes nothing on Cancel', async () => {
    const { onClose } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
    expect(list()).toEqual([]);
  });
});
