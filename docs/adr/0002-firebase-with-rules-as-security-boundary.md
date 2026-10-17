# 0002. Firebase Auth + Firestore, with security rules as the client data boundary

- **Status:** Accepted (back-filled)
- **Date:** 2026-10-04

## Context

The app needs sign-in, per-user and shared data, realtime sync across devices, and offline
use, with no backend team to run servers. The Firebase web config (including the API key) is
public by design, so it can't protect anything.

## Decision

- Google Sign-in via Firebase Auth; data in Cloud Firestore, accessed directly from the client
  through `src/lib/firestore.ts`.
- `firestore.rules` is the security boundary for everything the client touches. Collections the
  client must not touch (`bistroInvites`, `sharedRecipes`, the bistro doc itself) have no client
  rules and are written only by `api/` with the admin SDK.
- Rules are deployed by a human (`firebase deploy --only firestore:rules`), never automatically.

## Consequences

- Any data-model change must be checked against the rules in the same PR.
- A rules mistake is a data breach, so rules changes always get human review (CODEOWNERS) and
  a written threat check in the PR.
- Rules in the repo and rules in production can drift; the README tells you to compare them.

## Alternatives considered

- **Own API for all data:** stronger central control, but loses Firestore's offline cache and
  realtime listeners, and adds servers to run.
