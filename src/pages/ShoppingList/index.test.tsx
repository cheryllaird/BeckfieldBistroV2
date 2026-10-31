import { render, screen, within } from '@testing-library/react';
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

const itemById = (id: string) => useStore.getState().shoppingItems.find((i) => i.id === id);

const openSheetFor = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.click(screen.getByRole('button', { name: /Edit$/ }));
  await user.click(screen.getByRole('button', { name: `Edit ${name}` }));
  return within(screen.getByRole('dialog', { name: 'Edit item' }));
};

beforeEach(() => {
  useStore.setState(initialState, true);
  useStore.setState({
    shoppingItems: [
      makeShoppingItem({ id: 'milk', name: 'milk', checked: true, listType: 'immediate' }),
      makeShoppingItem({ id: 'salt', name: 'salt', listType: 'stock-up' }),
    ],
  });
});

describe('ShoppingListPage — item sheet in edit mode', () => {
  it('moves an item to Stock up, confirms where it went, and the toast undo puts it back ticked', async () => {
    const user = userEvent.setup();
    renderPage();
    const sheet = await openSheetFor(user, 'milk');

    expect(sheet.getByRole('button', { name: 'Immediate' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(sheet.getByRole('button', { name: 'Stock up' }));

    expect(itemById('milk')).toMatchObject({ listType: 'stock-up', checked: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('milk')).not.toBeInTheDocument();
    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('Moved to Stock up');

    await user.click(within(toast).getByRole('button', { name: 'Undo' }));

    expect(itemById('milk')).toMatchObject({ listType: 'immediate', checked: true });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renames an item from the sheet', async () => {
    const user = userEvent.setup();
    renderPage();
    const sheet = await openSheetFor(user, 'milk');

    const input = sheet.getByRole('textbox', { name: 'Item name' });
    await user.clear(input);
    await user.type(input, 'oat milk{Enter}');
    await user.click(sheet.getByRole('button', { name: 'Done' }));

    expect(itemById('milk')?.name).toBe('oat milk');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('changes category with one tap and keeps the sheet open', async () => {
    const user = userEvent.setup();
    renderPage();
    const sheet = await openSheetFor(user, 'milk');

    await user.click(sheet.getByRole('button', { name: 'Frozen' }));

    expect(itemById('milk')?.category).toBe('Frozen');
    expect(sheet.getByRole('button', { name: 'Frozen' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('changes category straight from the row chip without opening the sheet', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /Edit$/ }));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Category for milk' }), 'Frozen');

    expect(itemById('milk')?.category).toBe('Frozen');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('removes an item from the sheet with an undo toast', async () => {
    const user = userEvent.setup();
    renderPage();
    const sheet = await openSheetFor(user, 'milk');

    await user.click(sheet.getByRole('button', { name: 'Remove item' }));

    expect(itemById('milk')).toBeUndefined();
    expect(screen.getByRole('status')).toHaveTextContent('Removed milk');
  });
});
