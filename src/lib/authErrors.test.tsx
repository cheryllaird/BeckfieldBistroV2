import { describe, expect, it } from 'vitest';
import { authErrorMessage } from './authErrors';

// Lives in the jsdom project because one branch reads window.location.
describe('authErrorMessage', () => {
  it('names the current hostname for an unauthorized domain', () => {
    expect(authErrorMessage('auth/unauthorized-domain')).toContain(`"${window.location.hostname}"`);
  });

  it.each([
    ['auth/operation-not-allowed', /not enabled/],
    ['auth/network-request-failed', /Network error/],
    ['auth/too-many-requests', /Too many/],
  ])('%s has a friendly message', (code, pattern) => {
    expect(authErrorMessage(code)).toMatch(pattern);
  });

  it('includes an unknown code in the fallback message', () => {
    expect(authErrorMessage('auth/popup-closed-by-user')).toBe(
      'Sign-in failed (auth/popup-closed-by-user). Please try again.',
    );
  });

  it('has a generic fallback when there is no code', () => {
    expect(authErrorMessage('')).toBe('Sign-in failed. Please try again.');
  });
});
