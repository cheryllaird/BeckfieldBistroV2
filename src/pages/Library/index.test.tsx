import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryPage } from './index';
import { useStore } from '../../store';
import { makeMealEntry, makeRecipe } from '../../test/factories';

vi.mock('../../lib/firestore');
vi.mock('../../lib/idbStorage');

const initialState = useStore.getState();

const renderPage = () =>
  render(
    <MemoryRouter>
      <LibraryPage />
    </MemoryRouter>,
  );

// Recipe cards title themselves with an h3; no shares are pending, so no other h3s render.
const sortControl = () => screen.getByRole('combobox', { name: 'Sort recipes' });

const cardTitles = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

beforeEach(() => {
  useStore.setState(initialState, true);
  useStore.setState({
    recipes: [
      makeRecipe({ id: 'pasta', title: 'Pasta bake', createdAt: '2026-03-01T00:00:00.000Z' }),
      makeRecipe({ id: 'fish', title: 'Fish pie', createdAt: '2026-02-01T00:00:00.000Z' }),
      makeRecipe({ id: 'dal', title: 'Dal', createdAt: '2026-01-01T00:00:00.000Z' }),
    ],
    mealEntries: [
      makeMealEntry({ id: 'm1', recipeId: 'dal' }),
      makeMealEntry({ id: 'm2', recipeId: 'dal', date: '2026-03-19' }),
      makeMealEntry({ id: 'm3', recipeId: 'fish' }),
    ],
  });
});

describe('LibraryPage — sort control', () => {
  it('defaults to Newest and reorders cards when Most planned is chosen', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(sortControl()).toHaveValue('newest');
    expect(cardTitles()).toEqual(['Pasta bake', 'Fish pie', 'Dal']);

    await user.selectOptions(sortControl(), 'Most planned');

    expect(sortControl()).toHaveValue('most-planned');
    expect(cardTitles()).toEqual(['Dal', 'Fish pie', 'Pasta bake']);
  });

  it('updates the order live when a meal is planned', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.selectOptions(sortControl(), 'Most planned');

    act(() => {
      useStore.setState((s) => ({
        mealEntries: [
          ...s.mealEntries,
          ...['p1', 'p2', 'p3'].map((id) => makeMealEntry({ id, recipeId: 'pasta' })),
        ],
      }));
    });

    expect(cardTitles()).toEqual(['Pasta bake', 'Dal', 'Fish pie']);
  });

  it('resets to Newest on each visit', async () => {
    const user = userEvent.setup();
    const { unmount } = renderPage();
    await user.selectOptions(sortControl(), 'Most planned');
    unmount();

    renderPage();
    expect(sortControl()).toHaveValue('newest');
    expect(cardTitles()).toEqual(['Pasta bake', 'Fish pie', 'Dal']);
  });
});
