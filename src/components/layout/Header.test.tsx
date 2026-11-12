import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from './Header';
import { useStore } from '../../store';

vi.mock('../../lib/firestore');
vi.mock('../../lib/idbStorage');

const initialState = useStore.getState();

beforeEach(() => {
  useStore.setState(initialState, true);
  useStore.setState({ user: { uid: 'me', name: 'Sam Cook', email: 'sam@example.com' }, isAuthenticated: true });
});

describe('Header user menu', () => {
  it('opens the donation panel from "Buy me a coffee" and closes the menu', async () => {
    render(<MemoryRouter><Header /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Profile menu' }));
    await userEvent.click(screen.getByRole('button', { name: /buy me a coffee/i }));

    expect(useStore.getState().supportPanelOpen).toBe(true);
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
  });
});
