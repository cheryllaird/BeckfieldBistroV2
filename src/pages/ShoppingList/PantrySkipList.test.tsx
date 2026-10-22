import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PantrySkipList } from './PantrySkipList';
import { makeIngredient, makePantryItem } from '../../test/factories';
import type { PantrySkip } from '../../lib/ingredients';

const salt: PantrySkip = {
  key: 'sea salt flakes',
  ingredient: makeIngredient({ name: 'sea salt flakes' }),
  pantryItem: makePantryItem({ name: 'salt' }),
};
const oil: PantrySkip = {
  key: 'olive oil',
  ingredient: makeIngredient({ name: 'olive oil' }),
  pantryItem: makePantryItem({ id: 'p2', name: 'oil' }),
};

const renderList = (props: Partial<React.ComponentProps<typeof PantrySkipList>> = {}) =>
  render(
    <MemoryRouter>
      <PantrySkipList skipped={[salt, oil]} added={new Set()} onAdd={vi.fn()} {...props} />
    </MemoryRouter>,
  );

describe('PantrySkipList', () => {
  it('shows only the count until opened', () => {
    renderList();

    expect(screen.getByRole('button', { name: '2 ingredients in store cupboard — skipped' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/cupboard: salt/)).not.toBeInTheDocument();
  });

  it('uses the singular for one ingredient', () => {
    renderList({ skipped: [salt] });

    expect(screen.getByText('1 ingredient in store cupboard — skipped')).toBeInTheDocument();
  });

  it('opens to each ingredient and the cupboard item that covered it', async () => {
    renderList();

    await userEvent.click(screen.getByRole('button', { name: /in store cupboard/ }));

    expect(screen.getByText('sea salt flakes (cupboard: salt)')).toBeInTheDocument();
    expect(screen.getByText('olive oil (cupboard: oil)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /take it out of your store cupboard/ })).toHaveAttribute('href', '/pantry');
  });

  it('adds just the chosen ingredient', async () => {
    const onAdd = vi.fn();
    renderList({ onAdd });

    await userEvent.click(screen.getByRole('button', { name: /in store cupboard/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Add anyway: olive oil' }));

    expect(onAdd).toHaveBeenCalledExactlyOnceWith(oil);
  });

  it('shows added ingredients as added, and lets onRemove switch them off', async () => {
    const onRemove = vi.fn();
    renderList({ added: new Set(['olive oil']), onRemove });

    await userEvent.click(screen.getByRole('button', { name: /in store cupboard/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Added: olive oil' }));

    expect(onRemove).toHaveBeenCalledWith(oil);
  });

  it('renders nothing when the cupboard skipped nothing', () => {
    const { container } = renderList({ skipped: [] });

    expect(container).toBeEmptyDOMElement();
  });
});
