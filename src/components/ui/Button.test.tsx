import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders its children as a clickable button', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Save
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Save' });
    await userEvent.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveClass('opacity-50');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('defaults to the primary, medium style', () => {
    render(<Button>Go</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('bg-amber-500', 'px-4');
    expect(button).not.toHaveClass('w-full');
  });

  it('applies variant, size, fullWidth and extra classes', () => {
    render(
      <Button variant="danger" size="sm" fullWidth className="mt-2">
        Delete
      </Button>,
    );
    expect(screen.getByRole('button')).toHaveClass('bg-red-50', 'px-3', 'w-full', 'mt-2');
  });

  it('passes native attributes through', () => {
    render(
      <Button type="submit" aria-label="Submit form">
        Go
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Submit form' })).toHaveAttribute('type', 'submit');
  });
});
