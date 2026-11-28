import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DayRow } from './DayRow';
import { useStore } from '../../store';
import { makeRecipe } from '../../test/factories';
import type { MealEntry } from '../../types';

vi.mock('../../lib/firestore');
vi.mock('../../lib/idbStorage');

const initialState = useStore.getState();
const date = new Date(2026, 10, 3);
const recipe = makeRecipe({ id: 'r1', title: 'Pasta' });

const entry = (overrides: Partial<MealEntry>): MealEntry => ({
  id: 'e1',
  date: '2026-11-03',
  type: 'recipe',
  recipeId: 'r1',
  servings: 2,
  ...overrides,
} as MealEntry);

const renderRow = () =>
  render(
    <MemoryRouter>
      <DayRow date={date} />
    </MemoryRouter>,
  );

const entries = () => useStore.getState().mealEntries;

beforeEach(() => {
  useStore.setState(initialState, true);
  useStore.setState({ recipes: [recipe], shoppingItems: [] });
});

describe('DayRow', () => {
  it('lists the day’s meals ordered by meal time', () => {
    useStore.setState({
      mealEntries: [
        entry({ id: 'd', mealTime: 'dinner' }),
        entry({ id: 'b', type: 'custom', recipeId: undefined, customTitle: 'Porridge', mealTime: 'breakfast' }),
        entry({ id: 'x', date: '2026-11-04', type: 'custom', recipeId: undefined, customTitle: 'Other day' }),
      ],
    });
    renderRow();
    expect(screen.getByText(/Tuesday/)).toBeInTheDocument();
    const titles = screen.getAllByRole('button').map((b) => b.textContent);
    expect(titles.indexOf('Porridge')).toBeLessThan(titles.indexOf('Pasta'));
    expect(screen.queryByText('Other day')).not.toBeInTheDocument();
  });

  it('changes servings through the servings modal, never below 1', async () => {
    useStore.setState({ mealEntries: [entry({ servings: 1 })] });
    renderRow();
    await userEvent.click(screen.getByRole('button', { name: 'Edit servings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reduce servings' }));
    expect(entries()[0].servings).toBe(1);
    await userEvent.click(screen.getByRole('button', { name: 'Increase servings' }));
    expect(entries()[0].servings).toBe(2);
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('button', { name: 'Increase servings' })).not.toBeInTheDocument();
  });

  it('changes the meal time', async () => {
    useStore.setState({ mealEntries: [entry({ mealTime: 'dinner' })] });
    renderRow();
    await userEvent.selectOptions(screen.getByLabelText('Meal time'), 'lunch');
    expect(entries()[0].mealTime).toBe('lunch');
  });

  it('removes a meal only after confirming', async () => {
    useStore.setState({ mealEntries: [entry({})] });
    renderRow();
    await userEvent.click(screen.getByRole('button', { name: 'Remove meal' }));
    expect(screen.getByText('Pasta will be removed from your plan.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(entries()).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Remove meal' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(entries()).toHaveLength(0);
  });

  it('adds a custom meal to the shopping list once and shows it as added', async () => {
    useStore.setState({
      mealEntries: [entry({ type: 'custom', recipeId: undefined, customTitle: 'Tacos' })],
    });
    renderRow();
    await userEvent.click(screen.getByRole('button', { name: 'Add to shopping list' }));
    const items = useStore.getState().shoppingItems;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'Tacos', checked: false });
    expect(items[0].mealSources?.[0].mealEntryId).toBe('e1');

    await userEvent.click(screen.getByRole('button', { name: 'Added to shopping list' }));
    expect(useStore.getState().shoppingItems).toHaveLength(1);
  });

  it('shows an icon thumbnail for dining out, with no shopping list button', () => {
    useStore.setState({
      mealEntries: [entry({ type: 'dining-out', recipeId: undefined, customTitle: 'The Crown' })],
    });
    renderRow();
    const row = screen.getByText('The Crown').closest('div.flex.items-start') as HTMLElement;
    expect(within(row).queryByRole('button', { name: /shopping list/i })).not.toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Move to a different day' })).toBeInTheDocument();
  });
});
