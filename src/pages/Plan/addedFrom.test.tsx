import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanMealModal } from './PlanMealModal';
import { PlanDateModal } from '../RecipeDetail/PlanDateModal';
import { useStore } from '../../store';
import { makeRecipe } from '../../test/factories';

vi.mock('../../lib/firestore');
vi.mock('../../lib/idbStorage');

const initialState = useStore.getState();
const recipe = makeRecipe({ id: 'r1', title: 'Pasta' });
const entries = () => useStore.getState().mealEntries;

beforeEach(() => {
  useStore.setState(initialState, true);
  useStore.setState({ recipes: [recipe] });
});

describe('meal entry addedFrom', () => {
  it("PlanMealModal: a library recipe is recorded as 'plan'", async () => {
    render(<PlanMealModal date="2026-11-03" onClose={vi.fn()} />);
    await userEvent.click(screen.getByText('Pasta'));
    expect(entries()[0]).toMatchObject({ type: 'recipe', addedFrom: 'plan' });
  });

  it("PlanMealModal: a custom meal is recorded as 'plan'", async () => {
    render(<PlanMealModal date="2026-11-03" onClose={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText('Search recipes…'), 'Tacos');
    await userEvent.click(screen.getByText('Add as custom meal'));
    expect(entries()[0]).toMatchObject({ type: 'custom', addedFrom: 'plan' });
  });

  it("PlanMealModal: dining out is recorded as 'plan'", async () => {
    render(<PlanMealModal date="2026-11-03" onClose={vi.fn()} />);
    await userEvent.click(screen.getByText('Dining out'));
    await userEvent.click(screen.getByRole('button', { name: /mark as dining out/i }));
    expect(entries()[0]).toMatchObject({ type: 'dining-out', addedFrom: 'plan' });
  });

  it.each(['recipe-detail', 'library'] as const)('PlanDateModal stores the %s source it is given', async (addedFrom) => {
    render(
      <MemoryRouter>
        <PlanDateModal recipe={recipe} servings={2} addedFrom={addedFrom} initialDate="2026-11-03" onClose={vi.fn()} onConfirm={vi.fn()} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(entries()[0]).toMatchObject({ recipeId: 'r1', addedFrom });
  });
});
