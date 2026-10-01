// Decides how to bring an account's bistro copy up to date with its legacy
// users/{uid}/… library, for accounts that were migrated while an older
// version of the app (which still writes to the legacy paths) was in use.
//
// Every input time is a Firestore server write time (doc.updateTime) in ms,
// never an app-supplied field, so device clocks can't skew the outcome.
//
//   since       start of the last completed copy/sync of this account.
//               Legacy docs written after it may hold edits not yet copied.
//   migratedTo  end of the original migration copy. During that copy the app
//               was held on its setup screen, so a bistro doc last written at
//               or before it is an untouched copy of a legacy doc.

export interface LegacySyncPlan {
  /** Doc ids to copy legacy → bistro. */
  copy: string[];
  /** Doc ids to delete from the bistro. */
  remove: string[];
}

export function planLegacySync(
  legacy: Map<string, number>,
  bistro: Map<string, number>,
  since: number,
  migratedTo: number,
): LegacySyncPlan {
  const copy: string[] = [];
  const remove: string[] = [];

  for (const [id, legacyTime] of legacy) {
    const bistroTime = bistro.get(id);
    if (bistroTime === undefined) {
      // New in the legacy library since the last copy. A legacy doc older than
      // that was already copied, so its absence means it was deleted in the
      // new app — leave it deleted.
      if (legacyTime > since) copy.push(id);
    } else if (legacyTime > bistroTime) {
      // Edited in the old app more recently than anyone touched the bistro copy.
      copy.push(id);
    }
  }

  for (const [id, bistroTime] of bistro) {
    // Gone from the legacy library and never touched in the new app since
    // the migration copied it: it was deleted in the old app. Anything
    // created or edited in the new app is newer than migratedTo and kept.
    if (!legacy.has(id) && bistroTime <= migratedTo) remove.push(id);
  }

  return { copy, remove };
}
