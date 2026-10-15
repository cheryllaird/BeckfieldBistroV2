// Pure rules for api/delete-account.ts, kept free of Firebase so they can be
// unit-tested.

import type { BistroDoc, Rejection } from './bistroRules.js';

/** How recently the user must have signed in to delete their account. */
export const RECENT_SIGN_IN_SECONDS = 5 * 60;

/**
 * Deletion needs a fresh sign-in, so a session left open on a shared device
 * (or a stolen ID token, which stays valid for an hour) can't erase the
 * account. `authTime` is the token's auth_time claim, in seconds: it is set
 * when the user signs in or re-authenticates, and a token refresh keeps it.
 */
export function checkRecentSignIn(authTime: number | undefined, nowMs: number): Rejection | null {
  if (!authTime || nowMs / 1000 - authTime > RECENT_SIGN_IN_SECONDS) {
    return { status: 403, error: "Please sign in again to confirm it's you, then try again." };
  }
  return null;
}

/**
 * Who loses access when the account's own bistro (bistros/{uid}) is deleted:
 * every other member, whose access list must drop it.
 */
export function membersToDetach(ownBistro: BistroDoc | null, uid: string): string[] {
  return ownBistro ? ownBistro.memberUids.filter((m) => m !== uid) : [];
}
