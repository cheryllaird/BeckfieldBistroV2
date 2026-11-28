import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecipeDetailPage } from './index';
import { useStore } from '../../store';
import { makeIngredient, makeRecipe } from '../../test/factories';

vi.mock('../../lib/firestore');
vi.mock('../../lib/idbStorage');

const initialState = useStore.getState();

function renderPage(recipeId = 'r1') {
  return render(
    <MemoryRouter initialEntries={[`/recipes/${recipeId}`]}>
      <Routes>
        <Route path="/recipes/:id" element={<RecipeDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useStore.setState(initialState, true);
});

describe('RecipeDetailPage', () => {
  it('shows a not-found message for an unknown recipe', () => {
    renderPage('missing');
    expect(screen.getByText('Recipe not found.')).toBeInTheDocument();
  });

  it('scales ingredient quantities with the servings adjuster', async () => {
    useStore.setState({
      recipes: [
        makeRecipe({
          id: 'r1',
          servings: 2,
          ingredients: [makeIngredient({ name: 'flour', quantity: 100, unit: 'g' })],
        }),
      ],
    });
    renderPage();
    const row = () => screen.getByText('flour').closest('li') as HTMLElement;
    expect(within(row()).getByText(/100\s+g/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Increase servings' }));
    expect(within(row()).getByText(/150\s+g/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Decrease servings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Decrease servings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Decrease servings' }));
    // Never drops below one serving.
    expect(within(row()).getByText(/50\s+g/)).toBeInTheDocument();
  });

  it('shows ingredient section titles when the recipe has sections', () => {
    useStore.setState({
      recipes: [
        makeRecipe({
          id: 'r1',
          ingredientSections: [
            { title: 'For the sauce', ingredients: [makeIngredient({ name: 'tomatoes' })] },
            { title: 'For the pasta', ingredients: [makeIngredient({ name: 'spaghetti' })] },
          ],
        }),
      ],
    });
    renderPage();
    expect(screen.getByText('For the sauce')).toBeInTheDocument();
    expect(screen.getByText('For the pasta')).toBeInTheDocument();
    expect(screen.getByText('tomatoes')).toBeInTheDocument();
    expect(screen.getByText('spaghetti')).toBeInTheDocument();
  });

  it('switches to the numbered method steps', async () => {
    useStore.setState({ recipes: [makeRecipe({ id: 'r1', steps: ['Boil water.', 'Add pasta.'] })] });
    renderPage();
    expect(screen.queryByText('Boil water.')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'method' }));
    const steps = screen.getAllByRole('listitem');
    expect(steps).toHaveLength(2);
    expect(within(steps[0]).getByText('1')).toBeInTheDocument();
    expect(within(steps[1]).getByText('Add pasta.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Increase servings' })).not.toBeInTheDocument();
  });
});
