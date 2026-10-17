# 0004. Offline-first: Firestore listeners → Zustand persisted to IndexedDB

- **Status:** Accepted (back-filled)
- **Date:** 2026-10-04

## Context

The app is used in kitchens and supermarkets with poor signal. Launches must be instant, show
the last known data, and accept edits offline that sync later, across several devices and
several members of a bistro.

## Decision

- `src/lib/firestore.ts` subscribes to the active bistro's collections with `onSnapshot`
  (Firestore persistent local cache enabled) and is the only module that talks to Firestore.
- Snapshots are applied into the Zustand store (`src/store/index.ts`), which is persisted to
  IndexedDB (`src/lib/idbStorage.ts`) so the UI renders from local state immediately.
- Components read from and write through the store; they never call Firebase.
- Shopping list merges use field-level logic in `src/lib/shoppingSync.ts`.

## Consequences

- One source of truth on the client; no second cache layer.
- The store holds subtle sync logic (e.g. guarding against stale snapshots clobbering local
  state); changes there need tests in `src/store/*.test.tsx`.
- `src/store/index.ts` is large and a candidate for splitting by slice, which must keep this
  data flow.

## Alternatives considered

- **Reading Firestore directly in components:** scatters sync logic and breaks offline launch.
