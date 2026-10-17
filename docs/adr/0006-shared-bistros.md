# 0006. Shared bistros as the unit of data ownership

- **Status:** Accepted (back-filled from #147)
- **Date:** 2026-10-04

## Context

Households want one shared library, plan and shopping list across members, while each person
keeps their own sign-in and Gemini key.

## Decision

- Every user owns a bistro at `bistros/{ownerUid}`, holding the library as subcollections; the
  bistro id is the owner's uid. Others join by invite and are listed in `memberUids`.
- Membership, invites and shares change only through `api/bistro.ts` / `api/share-recipe.ts`
  (admin SDK, transactions); guards live in `api/_utils/bistroRules.ts`.
- Personal data (Gemini key, bistro access list) stays under `users/{uid}/meta/`.
- Pre-bistro accounts are copied from `users/{uid}/…` by `api/migrate-bistro.ts`, and kept in
  sync with older app versions by `api/_utils/legacySync.ts`.

## Consequences

- The rules must keep the explicit `{collection}` segment under `bistros/{bid}`, or members
  could rewrite `memberUids`.
- Invites and shares trust only verified emails.
- The legacy migration and sync code is live. It can only be removed after a new ADR sets a
  sunset condition (e.g. no legacy writes for N days).

## Alternatives considered

- **Sharing individual recipes only:** doesn't cover a shared plan and list.
