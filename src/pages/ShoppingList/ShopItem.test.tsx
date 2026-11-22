import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ShopItem } from './ShopItem';
import { makeShoppingItem } from '../../test/factories';

describe('ShopItem', () => {
  it('calls onToggle when the item is tapped', async () => {
    const onToggle = vi.fn();
    render(<ShopItem item={makeShoppingItem({ name: 'eggs' })} onToggle={onToggle} />);

    await userEvent.click(screen.getByRole('button', { name: /eggs/ }));

    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('has no meal sources button when the item has no sources', () => {
    render(<ShopItem item={makeShoppingItem()} onToggle={() => {}} />);

    expect(screen.queryByRole('button', { name: 'View meal sources' })).toBeNull();
  });

  it('opens and closes the meal sources modal with each recipe and amount', async () => {
    const item = makeShoppingItem({
      name: 'onion',
      mealSources: [
        { mealEntryId: 'm1', recipeTitle: 'Chilli', scaledQuantity: 2, unit: '', ingredientName: 'onion' },
        { mealEntryId: 'm2', recipeTitle: 'Soup', scaledQuantity: 150, unit: 'g', ingredientName: 'onion' },
      ],
    });
    render(<ShopItem item={item} onToggle={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: 'View meal sources' }));

    expect(screen.getByText('Used in meals')).toBeTruthy();
    expect(screen.getByText('Chilli')).toBeTruthy();
    expect(screen.getByText('Soup')).toBeTruthy();
    expect(screen.getByText('150 g')).toBeTruthy();

    await userEvent.click(screen.getByText('Used in meals').nextElementSibling as HTMLElement);

    expect(screen.queryByText('Used in meals')).toBeNull();
  });
});
