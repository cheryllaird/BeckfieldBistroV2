import { describe, expect, it } from 'vitest';
import {
  checkAccept,
  checkInvite,
  checkMember,
  checkName,
  checkRemove,
  defaultBistroName,
  normalizeEmail,
  type BistroDoc,
} from './bistroRules';

const member = (name: string, email: string) => ({ name, email, joinedAt: '2026-01-01' });

// Ann owns the bistro (its id is her uid); Bob has joined it.
const bistro: BistroDoc = {
  name: "Ann's Bistro",
  ownerUid: 'ann',
  createdAt: '2026-01-01',
  memberUids: ['ann', 'bob'],
  members: { ann: member('Ann', 'ann@example.com'), bob: member('Bob', 'bob@example.com') },
};

describe('defaultBistroName', () => {
  it("uses the first name", () => {
    expect(defaultBistroName('Cheryl Laird')).toBe("Cheryl's Bistro");
  });

  it('falls back when there is no usable name', () => {
    expect(defaultBistroName('')).toBe('My Bistro');
    expect(defaultBistroName('someone@example.com')).toBe('My Bistro');
  });
});

describe('normalizeEmail', () => {
  it('trims and lowercases, and rejects non-strings', () => {
    expect(normalizeEmail('  Bob@Example.COM ')).toBe('bob@example.com');
    expect(normalizeEmail(undefined)).toBe('');
  });
});

describe('checkName', () => {
  it('requires a non-blank name of sensible length', () => {
    expect(checkName('Home')).toBeNull();
    expect(checkName('   ')?.status).toBe(400);
    expect(checkName(42)?.status).toBe(400);
    expect(checkName('x'.repeat(61))?.status).toBe(400);
  });
});

describe('checkMember', () => {
  it('lets members through and rejects everyone else', () => {
    expect(checkMember(bistro, 'bob')).toBeNull();
    expect(checkMember(bistro, 'eve')?.status).toBe(403);
    expect(checkMember(null, 'ann')?.status).toBe(403);
  });
});

describe('checkInvite', () => {
  it('lets any member invite, not just the owner', () => {
    expect(checkInvite(bistro, 'bob', 'bob@example.com', 'cat@example.com', [])).toBeNull();
  });

  it('rejects non-members', () => {
    expect(checkInvite(bistro, 'eve', 'eve@example.com', 'cat@example.com', [])?.status).toBe(403);
  });

  it('rejects bad emails, yourself, existing members and duplicates', () => {
    expect(checkInvite(bistro, 'ann', 'ann@example.com', 'not-an-email', [])?.status).toBe(400);
    expect(checkInvite(bistro, 'ann', 'ann@example.com', 'ann@example.com', [])?.error).toMatch(/yourself/);
    expect(checkInvite(bistro, 'ann', 'ann@example.com', 'bob@example.com', [])?.error).toMatch(/already a member/);
    expect(
      checkInvite(bistro, 'ann', 'ann@example.com', 'cat@example.com', ['cat@example.com'])?.status,
    ).toBe(409);
  });
});

describe('checkRemove', () => {
  it('lets any member remove another non-owner member', () => {
    expect(checkRemove(bistro, 'ann', 'ann', 'bob')).toBeNull();
    const three = { ...bistro, memberUids: [...bistro.memberUids, 'cat'] };
    expect(checkRemove(three, 'ann', 'bob', 'cat')).toBeNull();
  });

  it('lets a non-owner leave (remove themselves)', () => {
    expect(checkRemove(bistro, 'ann', 'bob', 'bob')).toBeNull();
  });

  it('never removes the owner, and the owner cannot leave their own bistro', () => {
    expect(checkRemove(bistro, 'ann', 'bob', 'ann')?.error).toMatch(/owner can't be removed/);
    expect(checkRemove(bistro, 'ann', 'ann', 'ann')?.error).toMatch(/can't leave your own/);
  });

  it('rejects non-members and unknown targets', () => {
    expect(checkRemove(bistro, 'ann', 'eve', 'bob')?.status).toBe(403);
    expect(checkRemove(bistro, 'ann', 'ann', 'eve')?.status).toBe(404);
  });
});

describe('checkAccept', () => {
  it('only the addressee can accept or decline', () => {
    expect(checkAccept({ toEmail: 'cat@example.com' }, 'cat@example.com')).toBeNull();
    expect(checkAccept({ toEmail: 'cat@example.com' }, 'eve@example.com')?.status).toBe(403);
    expect(checkAccept({ toEmail: 'cat@example.com' }, '')?.status).toBe(403);
  });

  it('reports a revoked or already-used invite as gone', () => {
    expect(checkAccept(null, 'cat@example.com')?.status).toBe(404);
  });
});
