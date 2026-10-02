// Decides how to bring an account's bistro copy up to date with its legacy
// users/{uid}/… library, for accounts migrated while an older version of the
// app (which still writes to the legacy paths) was in use.
//
// Every time is a Firestore server write time in microseconds (see micros),
// never an app-supplied field, so device clocks can't skew the outcome.
//
// The ledger records each legacy doc that has been copied into the bistro:
// the legacy write time that was copied, and the bistro doc's write time
// straight after the copy — or NOT_OURS when the bistro doc is known to have
// diverged from any copy. A ledger entry therefore means "this doc has been in
// the bistro", which is what tells a doc deleted in the new app apart from one
// that is new in the old app.

export interface LedgerEntry {
  legacy: number;
  bistro: number;
}

/** Ledger value for a doc that is in the bistro but isn't an untouched copy. */
export const NOT_OURS = -1;

export interface LegacySyncInput {
  /** Legacy doc id → write time. */
  legacy: Map<string, number>;
  /** Bistro doc id → write time. */
  bistro: Map<string, number>;
  /**
   * The account's ledger, or null for an account migrated before ledgers
   * existed. Those fall back to time windows for one pass, after which the
   * caller seeds a ledger (see seedLedger).
   */
  ledger: Map<string, LedgerEntry> | null;
  /** Fallback only: when the original copy started. */
  since: number;
  /** Fallback only: when the original copy finished (the app was blocked). */
  migratedTo: number;
}

export interface LegacySyncPlan {
  /** Doc ids to copy legacy → bistro. */
  copy: string[];
  /** Doc ids to delete from the bistro. */
  remove: string[];
  /** Ledger entries to drop: their doc is gone from the legacy library. */
  forget: string[];
}

export function planLegacySync({ legacy, bistro, ledger, since, migratedTo }: LegacySyncInput): LegacySyncPlan {
  const copy: string[] = [];
  const remove: string[] = [];
  const forget: string[] = [];

  for (const [id, legacyTime] of legacy) {
    const bistroTime = bistro.get(id);
    const entry = ledger?.get(id);

    if (bistroTime === undefined) {
      if (ledger) {
        // Never been in the bistro: new in the old app (including docs it
        // added while the original copy ran). Been there and gone: deleted in
        // the new app, and that deletion stands.
        if (!entry) copy.push(id);
      } else if (legacyTime > since) {
        copy.push(id);
      }
    } else if (entry && entry.bistro === bistroTime) {
      // Still exactly our copy: take any later edit from the old app.
      if (legacyTime > entry.legacy) copy.push(id);
    } else if (legacyTime > bistroTime) {
      // Edited on both sides (or no ledger yet): the newer edit wins.
      copy.push(id);
    }
  }

  for (const [id, bistroTime] of bistro) {
    if (legacy.has(id)) continue;
    const entry = ledger?.get(id);
    // Deleted in the old app. Remove the bistro doc only if it is still
    // exactly what was copied — anything edited or created in the new app
    // stays.
    const untouchedCopy = ledger ? !!entry && entry.bistro === bistroTime : bistroTime <= migratedTo;
    if (untouchedCopy) remove.push(id);
  }

  if (ledger) {
    for (const id of ledger.keys()) if (!legacy.has(id)) forget.push(id);
  }

  return { copy, remove, forget };
}

/**
 * Builds the first ledger for an account migrated before ledgers existed,
 * from the state after its first (time-window) pass. Every doc present on
 * both sides has been in the bistro; it counts as an untouched copy only if
 * nothing has written to it since the original copy, or this pass just
 * copied it.
 */
export function seedLedger(
  legacy: Map<string, number>,
  bistro: Map<string, number>,
  justCopied: Map<string, number>,
  migratedTo: number,
): Map<string, LedgerEntry> {
  const ledger = new Map<string, LedgerEntry>();
  for (const [id, legacyTime] of legacy) {
    const copiedAt = justCopied.get(id);
    if (copiedAt !== undefined) {
      ledger.set(id, { legacy: legacyTime, bistro: copiedAt });
      continue;
    }
    const bistroTime = bistro.get(id);
    if (bistroTime === undefined) continue;
    ledger.set(id, { legacy: legacyTime, bistro: bistroTime <= migratedTo ? bistroTime : NOT_OURS });
  }
  return ledger;
}
