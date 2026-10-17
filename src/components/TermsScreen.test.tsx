import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/firestore');
vi.mock('../lib/idbStorage');
vi.mock('../lib/legal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/legal')>();
  return {
    ...actual,
    LEGAL: {
      termsVersion: '2026-11-01',
      termsUrl: 'https://example.com/terms',
      privacyUrl: 'https://example.com/privacy',
      copyrightUrl: '',
    },
  };
});

const { useStore } = await import('../store');
const { saveTermsAcceptance } = await import('../lib/firestore');
const { TermsScreen } = await import('./TermsScreen');

const initialState = useStore.getState();
const ME = { uid: 'me', name: 'Cheryl Laird', email: 'cheryl@example.com' };

beforeEach(() => {
  useStore.setState(initialState, true);
  vi.mocked(saveTermsAcceptance).mockClear();
});

describe('TermsScreen', () => {
  it('links to the Terms and Privacy Policy', () => {
    useStore.setState({ user: ME, isAuthenticated: true, termsAcceptedVersion: null });
    render(<TermsScreen />);

    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', 'https://example.com/terms');
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', 'https://example.com/privacy');
  });

  it('records acceptance only once the box is ticked', async () => {
    useStore.setState({ user: ME, isAuthenticated: true, termsAcceptedVersion: null });
    render(<TermsScreen />);

    const proceed = screen.getByRole('button', { name: 'Continue' });
    expect(proceed).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(proceed);

    expect(saveTermsAcceptance).toHaveBeenCalledWith('me', '2026-11-01');
    expect(useStore.getState().termsAcceptedVersion).toBe('2026-11-01');
  });

  it('says the terms changed for someone who accepted an older version', () => {
    useStore.setState({ user: ME, isAuthenticated: true, termsAcceptedVersion: '2026-01-01' });
    render(<TermsScreen />);

    expect(screen.getByText('Our terms have changed')).toBeInTheDocument();
  });
});
