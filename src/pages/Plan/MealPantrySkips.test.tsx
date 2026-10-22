import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MealPantrySkips } from './MealPantrySkips';
import { useStore } from '../../store';
import { makeIngredient, makeMealEntry, makePantryItem, makeRecipe } from '../../test/factories';

vi.mock('../../lib/firestore');
vi.mock('../../lib/idbStorage');

const initialState = useStore.getState();
const entry = makeMealEntry({ id: 'm1', recipeId: 'r1', servings: 4 });

beforeEach(() => {
  useStore.setState(initialState, true);
  useStore.setState({
    recipes: [
      makeRecipe({
        id: 'r1',
        title: 'Pasta',
        servings: 2,
        ingredients: [
          makeIngredient({ name: 'olive oil', quantity: 2, unit: 'tbsp' }),
          makeIngredient({ name: 'garlic', quantity: 2, unit: '' }),
        ],
      }),
    ],
    pantryItems: [makePantryItem({ name: 'oil', normalizedName: 'oil' })],
  });
});

const renderSkips = () => render(<MemoryRouter><MealPantrySkips entry={entry} /></MemoryRouter>);

describe('MealPantrySkips', () => {
  it('adds only the chosen ingredient, scaled, with the meal as its source', async () => {
    renderSkips();

    await userEvent.click(screen.getByRole('button', { name: /1 ingredient in store cupboard/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Add anyway: olive oil' }));

    const items = useStore.getState().shoppingItems;
    expect(items).toHaveLength(1);
    expect(items[0].mealSources).toEqual([expect.objectContaining({ mealEntryId: 'm1', scaledQuantity: 4 })]);
    expect(screen.getByRole('button', { name: 'Added: olive oil' })).toBeDisabled();
  });

  it('shows nothing when no ingredient matches the cupboard', () => {
    useStore.setState({ pantryItems: [] });
    const { container } = renderSkips();

    expect(container).toBeEmptyDOMElement();
  });

  it('lists the same ingredients even when every ingredient is in the cupboard', () => {
    useStore.setState({ pantryItems: [makePantryItem({ normalizedName: 'oil' }), makePantryItem({ id: 'p2', name: 'garlic', normalizedName: 'garlic' })] });
    renderSkips();

    expect(screen.getByText('2 ingredients in store cupboard — skipped')).toBeInTheDocument();
    expect(useStore.getState().shoppingItems).toEqual([]);
  });
});
