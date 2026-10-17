# 0012. Expire unaccepted shares and invites after 90 days

- **Status:** Accepted (back-filled from #159)
- **Date:** 2026-10-17

## Context

Shared recipes and bistro invites store the email address of someone who may never sign in.
Keeping that indefinitely isn't justified.

## Decision

- `sharedRecipes` and `bistroInvites` docs carry `expiresAt` = `createdAt` + 90 days
  (`PENDING_DAYS` in `api/_utils/pendingExpiry.ts`). A Firestore TTL policy deletes them.
- The API treats anything past expiry as gone straight away, judged from `createdAt`, so older
  docs follow the same schedule:
  - expired entries are left out of GET responses;
  - accepting an expired invite returns 410;
  - an expired invite doesn't block a new one.
- The TTL policies are project settings created once with `gcloud` (see README).
  `scripts/backfill-pending-expiry.mjs` backfills old docs.

## Consequences

- TTL deletion is lazy (usually within a day), so the API-side check is what users see.
- A new Firebase project needs the TTL policies set up by hand.

## Alternatives considered

- **A scheduled cleanup function:** more moving parts than a built-in TTL policy.
