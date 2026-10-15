import { describe, expect, it } from 'vitest';
import { checkRecentSignIn, membersToDetach, RECENT_SIGN_IN_SECONDS } from './accountDeletion';
import type { BistroDoc } from './bistroRules';

const now = Date.UTC(2026, 9, 15, 12, 0, 0);
const nowSec = now / 1000;

describe('checkRecentSignIn', () => {
  it('allows a sign-in within the window', () => {
    expect(checkRecentSignIn(nowSec - 30, now)).toBeNull();
    expect(checkRecentSignIn(nowSec - RECENT_SIGN_IN_SECONDS, now)).toBeNull();
  });

  it('rejects an older sign-in', () => {
    expect(checkRecentSignIn(nowSec - RECENT_SIGN_IN_SECONDS - 1, now)?.status).toBe(403);
  });

  it('rejects a token with no auth_time', () => {
    expect(checkRecentSignIn(undefined, now)?.status).toBe(403);
  });
});

describe('membersToDetach', () => {
  const member = { name: 'x', email: 'x@example.com', joinedAt: '2026-01-01' };
  const bistro: BistroDoc = {
    name: "Ann's Bistro",
    ownerUid: 'ann',
    createdAt: '2026-01-01',
    memberUids: ['ann', 'bob', 'cat'],
    members: { ann: member, bob: member, cat: member },
  };

  it('lists every member except the owner', () => {
    expect(membersToDetach(bistro, 'ann')).toEqual(['bob', 'cat']);
  });

  it('is empty when the bistro doc was never created', () => {
    expect(membersToDetach(null, 'ann')).toEqual([]);
  });
});
