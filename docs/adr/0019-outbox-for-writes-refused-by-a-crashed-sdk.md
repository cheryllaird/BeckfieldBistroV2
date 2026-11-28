# 0019. Keep a device-local outbox for writes a crashed Firestore SDK refused

- **Status:** Accepted
- **Date:** 2026-11-22
- **Deciders:** the PR reviewer
- **PR:** closes #242

## Context

ADR 0004 relies on Firestore's persistent cache to queue offline writes and replay them on the
next launch. The store's reconcile (`reconcileByRecency`, `src/store/index.ts`) depends on that:
it drops items that exist only locally, so that deletes from other devices stick.

After the SDK's fatal internal crash (`recoverIfSdkCrashed`, `src/lib/firestore.ts`), writes
throw synchronously and are never queued. The app auto-reloads (#241). The first snapshot after
the reload then drops meals and pantry items added since the crash, and brings back ones deleted
since then.

## Decision

- `src/lib/unsentWrites.ts` keeps an outbox in `localStorage` (`bistro-unsent-writes`). It holds
  one record per document: uid, bistro, collection, id, `set` with its data, or `delete`.
- `fireAndForget` records a meal-entry or pantry-item write only when the SDK throws
  synchronously, which means the write never reached the offline queue.
- `attachDataListeners` calls `replayUnsentWrites(bistroId, uid)` before it subscribes. The
  replayed writes are then pending in the first snapshot, and the existing reconcile keeps or
  removes the items with no change to its rules. A record is forgotten once its write is
  acknowledged or rejected by the server.
- Sign-out (and so account deletion) clears the outbox.

## Consequences

- Only writes this device failed to send are replayed, so deletes from other devices are still
  honoured.
- Using `localStorage` keeps the write synchronous, so the record is on disk before the reload
  300 ms later. The Zustand IndexedDB persist is async and gives no such guarantee.
- Scope is limited to meal entries and pantry items. Recipes reject to their caller
  (`saveRecipe`), and the shopping list has its own tombstone sync. Extend the outbox if another
  collection shows the same loss.
- A replayed `set` is the device's last write for that doc. Like any queued offline write, it
  can overwrite a newer edit made on another device in the meantime.

## Alternatives considered

- **Keep local-only items in the reconcile:** this would resurrect items deleted on other
  devices, which is the behaviour the reconcile exists to prevent.
- **Store the outbox in the Zustand store (IndexedDB):** the persist is async and can lose the
  race with the recovery reload.
