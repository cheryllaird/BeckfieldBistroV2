import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PantryItemRow } from './PantryItemRow';
import { useStore } from '../../store';
import { makePantryItem, makeShoppingItem } from '../../test/factories';

vi.mock('../../lib/firestore');
vi.mock('../../lib/idbStorage');

const initialState = useStore.getState();
const salt = makePantryItem({ id: 'p1', name: 'salt', normalizedName: 'salt', category: 'Pantry' });

// Reads the item from the store, as the page does, so the row sees stock changes.
function Row() {
  const item = useStore((s) => s.pantryItems.find((p) => p.id === 'p1')!);
  const noop = vi.fn();
  return (
    <PantryItemRow
      item={item}
      dragIndex={0}
      isBeingDragged={false}
      onCategoryChange={noop}
      onRemove={noop}
      onDragStart={noop}
      onDragEnter={noop}
      onDragEnd={noop}
      onGripPointerDown={noop}
      onDragEnterAt={noop}
      onTouchDragEnd={noop}
    />
  );
}

const renderRow = () => render(<Row />);

const stockOf = () => useStore.getState().pantryItems.find((p) => p.id === 'p1')?.inStock;
const switchEl = () => screen.getByRole('switch', { name: 'salt in stock' });

beforeEach(() => {
  useStore.setState(initialState, true);
  useStore.setState({ pantryItems: [salt], shoppingItems: [] });
});

describe('PantryItemRow stock switch', () => {
  it('shows an item with no inStock field as in stock', () => {
    renderRow();
    expect(switchEl()).toBeChecked();
  });

  it('adds the item to the top of Stock up, unticked, with the same name and category', async () => {
    const user = userEvent.setup();
    useStore.setState({ shoppingItems: [makeShoppingItem({ id: 'x', name: 'milk' })] });
    renderRow();

    await user.click(switchEl());
    await user.click(screen.getByRole('button', { name: 'Add to Stock up' }));

    const [first] = useStore.getState().shoppingItems;
    expect(first).toMatchObject({ name: 'salt', category: 'Pantry', listType: 'stock-up', checked: false, manual: true });
    expect(useStore.getState().shoppingItems).toHaveLength(2);
    expect(stockOf()).toBe(false);
  });

  it('adds the item to Immediate', async () => {
    const user = userEvent.setup();
    renderRow();

    await user.click(switchEl());
    await user.click(screen.getByRole('button', { name: 'Add to Immediate' }));

    expect(useStore.getState().shoppingItems[0]).toMatchObject({ name: 'salt', listType: 'immediate' });
    expect(stockOf()).toBe(false);
  });

  it('adds nothing on Skip, but the item is still out of stock', async () => {
    const user = userEvent.setup();
    renderRow();

    await user.click(switchEl());
    await user.click(screen.getByRole('button', { name: 'Skip' }));

    expect(useStore.getState().shoppingItems).toEqual([]);
    expect(stockOf()).toBe(false);
  });

  it('says "Already on your list" and adds nothing when an unticked match is on either list', async () => {
    const user = userEvent.setup();
    useStore.setState({
      shoppingItems: [makeShoppingItem({ id: 'x', name: '1 tsp Salt', listType: 'immediate' })],
    });
    renderRow();

    await user.click(switchEl());
    await user.click(screen.getByRole('button', { name: 'Add to Stock up' }));

    expect(useStore.getState().shoppingItems).toHaveLength(1);
    expect(screen.getByText(/Already on your list/)).toBeInTheDocument();
    expect(stockOf()).toBe(false);
  });

  it('puts the item back in stock without prompting', async () => {
    const user = userEvent.setup();
    useStore.setState({ pantryItems: [{ ...salt, inStock: false }] });
    renderRow();

    await user.click(switchEl());

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(stockOf()).toBe(true);
  });

  it('shows no "Out of stock" text under an out-of-stock item; the dimmed row and switch say it', () => {
    useStore.setState({ pantryItems: [{ ...salt, inStock: false }] });
    renderRow();

    expect(switchEl()).not.toBeChecked();
    expect(screen.queryByText(/Out of stock/)).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
