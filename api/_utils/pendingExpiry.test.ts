import { describe, expect, it } from 'vitest';
import { isPendingExpired, livePending, pendingExpiry, PENDING_DAYS } from './pendingExpiry';

const now = new Date('2026-10-15T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

describe('pendingExpiry', () => {
  it(`is ${PENDING_DAYS} days after creation`, () => {
    expect(pendingExpiry(new Date('2026-01-01T00:00:00Z')).toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });
});

describe('isPendingExpired', () => {
  it('keeps anything younger than the window', () => {
    expect(isPendingExpired(daysAgo(PENDING_DAYS - 1), now)).toBe(false);
  });

  it('expires at the end of the window', () => {
    expect(isPendingExpired(daysAgo(PENDING_DAYS), now)).toBe(true);
    expect(isPendingExpired(daysAgo(PENDING_DAYS + 30), now)).toBe(true);
  });

  it('never expires a doc with no readable date', () => {
    expect(isPendingExpired(undefined, now)).toBe(false);
    expect(isPendingExpired('not a date', now)).toBe(false);
  });
});

describe('livePending', () => {
  it('drops expired docs and the expiresAt field', () => {
    const fresh = { id: 'a', createdAt: daysAgo(1), expiresAt: { _seconds: 1 } };
    const stale = { id: 'b', createdAt: daysAgo(PENDING_DAYS + 1), expiresAt: { _seconds: 1 } };
    expect(livePending([fresh, stale], now)).toEqual([{ id: 'a', createdAt: fresh.createdAt }]);
  });
});
