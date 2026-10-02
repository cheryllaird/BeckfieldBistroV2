import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../lib/firestore');
vi.mock('../../lib/idbStorage');
vi.mock('../../lib/bistro', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/bistro')>()),
  fetchBistroInvites: vi.fn(async () => []),
  fetchIncomingInvites: vi.fn(async () => []),
}));

const { useStore } = await import('../../store');
const { BistroCard } = await import('./BistroCard');

const initialState = useStore.getState();
const ME = { uid: 'me', name: 'Cheryl Laird', email: 'cheryl@example.com' };

beforeEach(() => {
  useStore.setState(initialState, true);
});

describe('BistroCard', () => {
  it("shows the user's own bistro before its doc has loaded", () => {
    // e.g. the bistro doc doesn't exist yet, or can't be read.
    useStore.setState({ user: ME, isAuthenticated: true, bistroMigrated: true, bistros: {} });

    render(<BistroCard />);

    expect(screen.getByText("Cheryl's Bistro")).toBeInTheDocument();
    expect(screen.getByText('Cheryl Laird')).toBeInTheDocument();
  });

  it('lists the other bistros the user can open', () => {
    useStore.setState({
      user: ME,
      isAuthenticated: true,
      bistroMigrated: true,
      bistros: {
        ann: {
          id: 'ann',
          name: "Ann's Bistro",
          ownerUid: 'ann',
          createdAt: '',
          memberUids: ['ann', 'me'],
          members: {},
        },
      },
    });

    render(<BistroCard />);

    expect(screen.getByText('Your other bistros')).toBeInTheDocument();
    expect(screen.getByText("Ann's Bistro")).toBeInTheDocument();
  });
});
