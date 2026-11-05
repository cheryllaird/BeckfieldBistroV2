import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { ExtractionProgress } from './ExtractionProgress';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('ExtractionProgress', () => {
  it('shows the label for the current stage in a polite live region', () => {
    const { rerender } = render(<ExtractionProgress stage="preparing" />);
    expect(screen.getByText('Preparing photo')).toBeInTheDocument();
    expect(screen.getByText('Preparing photo').closest('[aria-live]')).toHaveAttribute('aria-live', 'polite');
    rerender(<ExtractionProgress stage="reading" />);
    expect(screen.getByText('Reading recipe')).toBeInTheDocument();
    expect(screen.queryByText('Preparing photo')).not.toBeInTheDocument();
  });

  it('shows the long-wait copy only from 10 seconds', () => {
    render(<ExtractionProgress stage="reading" />);
    act(() => vi.advanceTimersByTime(9_900));
    expect(screen.queryByText('Some photos take up to a minute.')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getByText('Some photos take up to a minute.')).toBeInTheDocument();
  });
});
