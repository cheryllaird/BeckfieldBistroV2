import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TipThankYouCard } from './TipThankYouCard';
import { useStore } from '../../store';
import { KOFI_URL } from '../../lib/tips';

vi.mock('../../lib/firestore');
vi.mock('../../lib/idbStorage');

const initialState = useStore.getState();

beforeEach(() => {
  useStore.setState(initialState, true);
});

describe('TipThankYouCard', () => {
  it('renders nothing when no milestone was reached', () => {
    const { container } = render(<TipThankYouCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it('thanks the user and links to Ko-fi in a new tab', () => {
    useStore.setState({ tipPromptMilestone: 5 });
    render(<TipThankYouCard />);
    expect(screen.getByText(/5 recipes saved/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /buy me a coffee/i });
    expect(link).toHaveAttribute('href', KOFI_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it.each(['Dismiss', 'Maybe later'])('hides when "%s" is tapped', async (name) => {
    useStore.setState({ tipPromptMilestone: 10 });
    render(<TipThankYouCard />);
    await userEvent.click(screen.getByRole('button', { name }));
    expect(useStore.getState().tipPromptMilestone).toBeNull();
    expect(screen.queryByText(/recipes saved/)).not.toBeInTheDocument();
  });

  it('hides once the tip link is tapped', async () => {
    useStore.setState({ tipPromptMilestone: 5 });
    render(<TipThankYouCard />);
    const link = screen.getByRole('link', { name: /buy me a coffee/i });
    link.addEventListener('click', (e) => e.preventDefault());
    await userEvent.click(link);
    expect(useStore.getState().tipPromptMilestone).toBeNull();
  });
});
