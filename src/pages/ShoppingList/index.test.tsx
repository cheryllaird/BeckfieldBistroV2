import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShoppingListPage } from './index';
import { useStore } from '../../store';
import { makeShoppingItem } from '../../test/factories';

vi.mock('../../lib/firestore');
vi.mock('../../lib/idbStorage');

const initialState = useStore.getState();

const renderPage = () =>
  render(
    <MemoryRouter>
      <ShoppingListPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  useStore.setState(initialState, true);
  useStore.setState({
    shoppingItems: [
      makeShoppingItem({ id: 'milk', name: 'milk', checked: true, listType: 'immediate' }),
      makeShoppingItem({ id: 'salt', name: 'salt', listType: 'stock-up' }),
    ],
  });
});

describe('ShoppingListPage — moving items between lists', () => {
  it('moves an item to Stock up from edit mode and undo puts it back ticked', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /Edit/ }));

    await user.click(screen.getByRole('button', { name: 'Move to Stock up' }));

    expect(useStore.getState().shoppingItems.find((i) => i.id === 'milk')).toMatchObject({
      listType: 'stock-up',
      checked: false,
    });
    expect(screen.queryByText('milk')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Stock up' }));
    expect(screen.getByText('milk')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Move to Immediate' })).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(useStore.getState().shoppingItems.find((i) => i.id === 'milk')).toMatchObject({
      listType: 'immediate',
      checked: true,
    });
  });
});
