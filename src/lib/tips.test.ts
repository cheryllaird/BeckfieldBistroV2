import { describe, expect, it } from 'vitest';
import { shouldShowTipPrompt } from './tips';

describe('shouldShowTipPrompt', () => {
  it('shows on the 5th and 10th saved recipe', () => {
    expect(shouldShowTipPrompt(5, false)).toBe(true);
    expect(shouldShowTipPrompt(10, false)).toBe(true);
  });

  it('does not show on other counts', () => {
    for (const n of [0, 1, 4, 6, 9, 11, 15, 20]) expect(shouldShowTipPrompt(n, false)).toBe(false);
  });

  it('never shows again once shown', () => {
    expect(shouldShowTipPrompt(5, true)).toBe(false);
    expect(shouldShowTipPrompt(10, true)).toBe(false);
  });
});
