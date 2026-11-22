import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryPage } from './index';
import { useStore } from '../../store';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { makeRecipe } from '../../test/factories';
import type { SharedRecipe } from '../../types';

vi.mock('../../lib/firestore');
vi.mock('../../lib/idbStorage');
vi.mock('../../hooks/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn(() => ({ isOnline: true, isSyncing: false })),
}));

const initialState = useStore.getState();

function NewRecipeStub() {
  const { pathname, search } = useLocation();
  return <p>At {pathname + search}</p>;
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/recipes']}>
      <Routes>
        <Route path="/recipes" element={<LibraryPage />} />
        <Route path="/recipes/new" element={<NewRecipeStub />} />
      </Routes>
    </MemoryRouter>,
  );

function makeShare(id: string, title: string): SharedRecipe {
  const recipe: Partial<ReturnType<typeof makeRecipe>> = makeRecipe({ title });
  delete recipe.id;
  delete recipe.userId;
  return { id, fromUid: 'u2', fromName: 'Sam', toEmail: 'me@example.com', recipe: recipe as SharedRecipe['recipe'], createdAt: '2026-11-01T00:00:00.000Z' };
}

beforeEach(() => {
  vi.mocked(useOnlineStatus).mockReturnValue({ isOnline: true, isSyncing: false });
  useStore.setState(initialState, true);
  useStore.setState({
    recipes: [makeRecipe({ id: 'pasta', title: 'Pasta bake' }), makeRecipe({ id: 'dal', title: 'Dal' })],
    incomingShares: [],
  });
});

describe('LibraryPage — layout', () => {
  it('drops the visible title but keeps a page heading', () => {
    renderPage();
    const heading = screen.getByRole('heading', { level: 2, name: 'My recipes' });
    expect(heading).toHaveClass('sr-only');
  });

  it('puts search and sort side by side in one row of the toolbar', () => {
    renderPage();
    const toolbar = screen.getByTestId('library-toolbar');
    const search = within(toolbar).getByRole('textbox', { name: /search recipes/i });
    const sort = within(toolbar).getByRole('combobox', { name: 'Sort recipes' });
    const row = search.closest('.flex-1')?.parentElement;
    expect(row).toContainElement(sort);
    expect(sort.parentElement).toHaveTextContent(/^Newest/); // the pill shows the current order
  });
});

describe('LibraryPage — Add recipe pill and sheet', () => {
  it.each([
    ['Photo of a recipe', 'upload'],
    ['Paste a link', 'url'],
    ['Type it in', 'manual'],
  ])('"%s" opens New Recipe on mode %s', async (label, mode) => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Add recipe' }));
    const sheet = screen.getByRole('dialog', { name: 'Add a recipe' });
    await user.click(within(sheet).getByRole('button', { name: new RegExp(label) }));
    expect(screen.getByText(`At /recipes/new?mode=${mode}`)).toBeInTheDocument();
  });

  it('disables Photo and Link offline but keeps Type it in', async () => {
    vi.mocked(useOnlineStatus).mockReturnValue({ isOnline: false, isSyncing: false });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Add recipe' }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByRole('button', { name: /Photo of a recipe/ })).toBeDisabled();
    expect(within(sheet).getByRole('button', { name: /Paste a link/ })).toBeDisabled();
    expect(within(sheet).getAllByText('Needs a connection')).toHaveLength(2);
    expect(within(sheet).getByRole('button', { name: /Type it in/ })).toBeEnabled();
  });

  it('hides the pill while the sheet is open and returns focus to it on close', async () => {
    const user = userEvent.setup();
    renderPage();
    const pill = screen.getByRole('button', { name: 'Add recipe' });
    await user.click(pill);
    expect(pill.parentElement).toHaveClass('invisible');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(pill.parentElement).not.toHaveClass('invisible');
    expect(pill).toHaveFocus();
  });

  it('hides the pill in select mode', async () => {
    renderPage();
    fireEvent.mouseDown(screen.getByText('Dal'));
    await act(() => new Promise((r) => setTimeout(r, 550)));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add recipe' })).not.toBeInTheDocument();
  });

  it('opens the sheet from the empty library', async () => {
    useStore.setState({ recipes: [] });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Add your first recipe' }));
    expect(screen.getByRole('dialog', { name: 'Add a recipe' })).toBeInTheDocument();
  });
});

describe('LibraryPage — Shared with you tab', () => {
  it('shows no tabs when nothing is shared', () => {
    renderPage();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('defaults to All with the share count visible, and switches to the inbox', async () => {
    useStore.setState({ incomingShares: [makeShare('s1', 'Fish pie'), makeShare('s2', 'Trifle')] });
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByRole('tab', { name: 'All 2' })).toHaveAttribute('aria-selected', 'true');
    const sharedTab = screen.getByRole('tab', { name: /Shared with you/ });
    expect(sharedTab).toHaveTextContent('2');
    expect(screen.queryByText('Fish pie')).not.toBeInTheDocument();

    await user.click(sharedTab);
    expect(screen.getByText('Fish pie')).toBeInTheDocument();
    expect(screen.getByText('Trifle')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Sort recipes' })).not.toBeInTheDocument();
  });

  it('Save all calls the store', async () => {
    const acceptAllShares = vi.fn().mockResolvedValue(undefined);
    useStore.setState({ incomingShares: [makeShare('s1', 'Fish pie')], acceptAllShares });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('tab', { name: /Shared with you/ }));
    await user.click(screen.getByRole('button', { name: 'Save all' }));
    expect(acceptAllShares).toHaveBeenCalledOnce();
  });

  it('returns to All and removes the tabs when the last share goes', async () => {
    useStore.setState({ incomingShares: [makeShare('s1', 'Fish pie')] });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('tab', { name: /Shared with you/ }));

    await act(async () => {
      useStore.setState({ incomingShares: [] });
    });

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByText('Pasta bake')).toBeInTheDocument();
  });
});
