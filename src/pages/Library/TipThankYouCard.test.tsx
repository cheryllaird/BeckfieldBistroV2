import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TipThankYouCard } from './TipThankYouCard';
import { useStore } from '../../store';

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

  it('thanks the user with the milestone reached', () => {
    useStore.setState({ tipPromptMilestone: 5 });
    render(<TipThankYouCard />);
    expect(screen.getByText(/5 recipes saved/)).toBeInTheDocument();
  });

  it.each(['Dismiss', 'Maybe later'])('hides when "%s" is tapped', async (name) => {
    useStore.setState({ tipPromptMilestone: 10 });
    render(<TipThankYouCard />);
    await userEvent.click(screen.getByRole('button', { name }));
    expect(useStore.getState().tipPromptMilestone).toBeNull();
    expect(screen.queryByText(/recipes saved/)).not.toBeInTheDocument();
  });

  it('opens the donation panel and hides itself when "Buy me a coffee" is tapped', async () => {
    useStore.setState({ tipPromptMilestone: 5 });
    render(<TipThankYouCard />);
    await userEvent.click(screen.getByRole('button', { name: /buy me a coffee/i }));
    expect(useStore.getState().supportPanelOpen).toBe(true);
    expect(useStore.getState().tipPromptMilestone).toBeNull();
  });
});
