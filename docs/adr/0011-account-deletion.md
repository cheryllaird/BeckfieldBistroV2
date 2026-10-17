# 0011. Users can delete their account and all their data

- **Status:** Accepted (back-filled from #158)
- **Date:** 2026-10-17

## Context

Users must be able to remove their account and personal data (UK GDPR). Data is spread across
their own bistro, other people's bistros, invites, shares, `users/{uid}` and Firebase Auth.
A careless delete could strand other bistro members, and a stolen ID token mustn't be able to
erase an account.

## Decision

- Settings → Account → Delete account: the user types DELETE and re-authenticates, then calls
  `POST /api/delete-account`.
- The server refuses tokens whose sign-in is older than five minutes
  (`RECENT_SIGN_IN_SECONDS` in `api/_utils/accountDeletion.ts`, using the `auth_time` claim).
- The steps, in order:
  1. Remove the user from other bistros (what they added there stays).
  2. Delete their own bistro, after dropping it from every member's access list.
  3. Delete invites and shares they sent or received.
  4. Delete `users/{uid}`.
  5. Delete the Auth user, last.
- Each step is idempotent, so a failed run can be retried. The client then signs out, clears
  Firestore's offline cache and reloads.

## Consequences

- New collections that hold personal data must be added to the deletion steps and their tests.
- Deleted data leaves the Firestore backups within their retention window (8 weeks), as stated
  in the Privacy Policy.

## Alternatives considered

- **Manual deletion on request:** doesn't scale and relies on someone being around.
