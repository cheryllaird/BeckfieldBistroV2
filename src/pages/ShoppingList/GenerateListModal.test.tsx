import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerateListModal } from './GenerateListModal';
import { useStore } from '../../store';
import { makeIngredient, makeMealEntry, makePantryItem, makeRecipe, makeShoppingItem } from '../../test/factories';

vi.mock('../../lib/firestore');
vi.mock('../../lib/idbStorage');

const initialState = useStore.getState();

const cake = makeRecipe({
  id: 'cake',
  title: 'Victoria Sponge',
  servings: 4,
  ingredients: [
    makeIngredient({ name: 'flour', quantity: 200, unit: 'g' }),
    makeIngredient({ name: 'eggs', quantity: 2, unit: '' }),
  ],
});

const bread = makeRecipe({
  id: 'bread',
  title: 'Soda Bread',
  servings: 2,
  ingredients: [
    makeIngredient({ name: 'Flour', quantity: 150, unit: 'grams' }),
    makeIngredient({ name: 'salt', quantity: 5, unit: 'g' }),
  ],
});

// Wednesday 18 March 2026: the modal offers this week and next.
const TODAY = new Date(2026, 2, 18, 12);

function renderModal() {
  const onClose = vi.fn();
  render(<GenerateListModal onClose={onClose} />);
  return { onClose };
}

const listNames = () => useStore.getState().shoppingItems.map((i) => i.name);

beforeEach(() => {
  // Fake only the clock, so user-event's own timers still run.
  vi.useFakeTimers({ now: TODAY, toFake: ['Date'] });
  useStore.setState(initialState, true);
  useStore.setState({
    recipes: [cake, bread],
    mealEntries: [
      makeMealEntry({ id: 'm-cake', recipeId: 'cake', date: '2026-03-18', servings: 4 }),
      // Bread for 4 from a recipe that serves 2: everything doubles.
      makeMealEntry({ id: 'm-bread', recipeId: 'bread', date: '2026-03-24', servings: 4 }),
      // Not offered: custom meals have no ingredients, and last month is out of range.
      makeMealEntry({ id: 'm-custom', type: 'custom', recipeId: undefined, customTitle: 'Takeaway', date: '2026-03-19' }),
      makeMealEntry({ id: 'm-old', recipeId: 'cake', date: '2026-02-01' }),
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GenerateListModal', () => {
  it('offers every recipe meal planned this week and next, preselected', () => {
    renderModal();

    expect(screen.getByText('Victoria Sponge')).toBeInTheDocument();
    expect(screen.getByText('Soda Bread')).toBeInTheDocument();
    expect(screen.queryByText('Takeaway')).not.toBeInTheDocument();
    expect(screen.getByText(/Wed 18 Mar · 4 servings/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate (2)' })).toBeEnabled();
  });

  it('consolidates and scales ingredients across the selected meals', async () => {
    const { onClose } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Generate (2)' }));

    // 200 g (cake) + 2 × 150 g (bread, doubled) = 500 g of flour
    expect(listNames()).toEqual(['2 eggs', '500 g flour', '10 g salt']);
    expect(useStore.getState().shoppingItems.every((i) => i.listType === 'immediate')).toBe(true);
    const flour = useStore.getState().shoppingItems.find((i) => i.name.endsWith('flour'));
    expect(flour?.mealSources?.map((s) => s.recipeTitle)).toEqual(['Victoria Sponge', 'Soda Bread']);
    expect(onClose).toHaveBeenCalled();
  });

  it('only uses the meals left selected', async () => {
    renderModal();

    await userEvent.click(screen.getByText('Soda Bread'));
    await userEvent.click(screen.getByRole('button', { name: 'Generate (1)' }));

    expect(listNames()).toEqual(['2 eggs', '200 g flour']);
  });

  it('cannot generate with nothing selected', async () => {
    renderModal();

    await userEvent.click(screen.getByText('Soda Bread'));
    await userEvent.click(screen.getByText('Victoria Sponge'));

    expect(screen.getByRole('button', { name: 'Generate (0)' })).toBeDisabled();
  });

  it('skips store cupboard staples and says how many', async () => {
    useStore.setState({ pantryItems: [makePantryItem({ name: 'salt', normalizedName: 'salt' })] });
    renderModal();

    expect(screen.getByText(/1 ingredient in store cupboard/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Generate (2)' }));

    expect(listNames()).not.toContain('10 g salt');
  });

  it('replaces the Immediate list but leaves Stock up untouched', async () => {
    useStore.setState({
      shoppingItems: [
        makeShoppingItem({ id: 'old', name: 'yesterday’s list', listType: 'immediate' }),
        makeShoppingItem({ id: 'bulk', name: 'loo roll', listType: 'stock-up' }),
      ],
    });
    renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Generate (2)' }));

    const names = listNames();
    expect(names).toContain('loo roll');
    expect(names).not.toContain('yesterday’s list');
  });

  it('explains when there is nothing to generate from', () => {
    useStore.setState({ mealEntries: [] });
    renderModal();

    expect(screen.getByText(/No recipe meals planned/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate (0)' })).toBeDisabled();
  });

  it('closes without changing the list on Cancel', async () => {
    const { onClose } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
    expect(useStore.getState().shoppingItems).toEqual([]);
  });
});
