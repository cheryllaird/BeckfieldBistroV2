import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../lib/firestore');
vi.mock('../../lib/idbStorage');

const { AppShellLoading } = await import('./AppShellLoading');

describe('AppShellLoading', () => {
  it('keeps the app chrome on screen with a loading status', () => {
    render(
      <MemoryRouter initialEntries={['/plan']}>
        <AppShellLoading />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Loading your bistro…');
    expect(screen.getByAltText('Beckfield Bistro')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Plan' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByText('Entering the Bistro...')).not.toBeInTheDocument();
  });
});
