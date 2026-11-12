import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupportPanelModal } from './SupportPanelModal';
import { useStore } from '../store';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { KOFI_PANEL_URL, KOFI_URL } from '../lib/tips';

vi.mock('../lib/firestore');
vi.mock('../lib/idbStorage');
vi.mock('../hooks/useOnlineStatus', () => ({ useOnlineStatus: vi.fn() }));

const initialState = useStore.getState();

beforeEach(() => {
  useStore.setState(initialState, true);
  vi.mocked(useOnlineStatus).mockReturnValue({ isOnline: true, isSyncing: false });
});

describe('SupportPanelModal', () => {
  it('loads nothing from Ko-fi until opened', () => {
    render(<SupportPanelModal />);
    expect(screen.queryByTitle('Ko-fi donation panel')).not.toBeInTheDocument();
  });

  it('shows the Ko-fi panel in a sandboxed frame that cannot navigate the app', () => {
    useStore.getState().openSupportPanel();
    render(<SupportPanelModal />);
    const frame = screen.getByTitle('Ko-fi donation panel');
    expect(frame).toHaveAttribute('src', KOFI_PANEL_URL);
    const sandbox = frame.getAttribute('sandbox') ?? '';
    expect(sandbox).toContain('allow-popups');
    expect(sandbox).not.toContain('allow-top-navigation');
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();

    fireEvent.load(frame);
    expect(screen.queryByLabelText('Loading')).not.toBeInTheDocument();
  });

  it('offers Ko-fi in the browser as a fallback', () => {
    useStore.getState().openSupportPanel();
    render(<SupportPanelModal />);
    const link = screen.getByRole('link', { name: /open ko-fi in your browser/i });
    expect(link).toHaveAttribute('href', KOFI_URL);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('explains instead of loading the panel when offline', () => {
    vi.mocked(useOnlineStatus).mockReturnValue({ isOnline: false, isSyncing: false });
    useStore.getState().openSupportPanel();
    render(<SupportPanelModal />);
    expect(screen.getByText("You're offline")).toBeInTheDocument();
    expect(screen.queryByTitle('Ko-fi donation panel')).not.toBeInTheDocument();
  });

  it('closes from the close button', async () => {
    useStore.getState().openSupportPanel();
    render(<SupportPanelModal />);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(useStore.getState().supportPanelOpen).toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
