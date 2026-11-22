import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { BottomSheet } from './BottomSheet';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && (
        <BottomSheet title="Pick one" onClose={() => setOpen(false)}>
          <button>First</button>
          <button disabled>Skipped</button>
          <button>Last</button>
        </BottomSheet>
      )}
    </>
  );
}

async function openSheet() {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Open' }));
  return user;
}

describe('BottomSheet', () => {
  it('is a labelled modal dialog with focus on its first enabled control', async () => {
    await openSheet();
    const dialog = screen.getByRole('dialog', { name: 'Pick one' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('keeps Tab inside the sheet, skipping disabled controls', async () => {
    const user = await openSheet();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
  });

  it('closes on Escape and returns focus to the opener', async () => {
    const user = await openSheet();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  });

  it('closes on a backdrop tap but not a tap inside the sheet', async () => {
    const user = await openSheet();
    await user.click(screen.getByRole('heading', { name: 'Pick one' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByTestId('bottom-sheet-backdrop'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes on browser Back and leaves no extra history entry', async () => {
    await openSheet();
    expect(window.history.state?.bottomSheet).toBe(true);
    window.history.back();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(window.history.state?.bottomSheet).toBeFalsy();
  });
});
