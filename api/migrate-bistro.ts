import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getFirestore,
  FieldPath,
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import { getUser } from './_utils/auth.js';
import {
  NOT_OURS,
  planLegacySync,
  seedLedger,
  type LedgerEntry,
} from './_utils/legacySync.js';

// Moves a pre-bistro account's library from users/{uid}/… to its own bistro
// at bistros/{uid}/…, and keeps the copy current while older app versions
// (which still write to the legacy paths) are in use.
//
// POST /api/migrate-bistro { restart?: boolean } → { done, copied }
//   The one-time copy. Resumable: each call copies until it nears its time
//   budget, records a cursor in users/{uid}/meta/bistroMigration and returns
//   done:false; the client calls again until done. Copies keep their doc ids,
//   so a retried or concurrent run overwrites rather than duplicates.
//
//   The client holds the app on a setup screen for one run, so nothing changes
//   between its rounds. A new run (restart: true) starts over rather than
//   resuming: after a failed run the user may have kept editing the legacy
//   paths, and docs before the old cursor would otherwise keep a stale copy.
//
//   Copy, never move. The legacy docs are left in place as a rollback. The
//   cutover is the migratedAt stamp on users/{uid}/meta/bistroAccess, written
//   only after every collection has landed: until it exists clients keep using
//   the legacy paths, so a failed or half-finished run can't lose anything.
//
// POST /api/migrate-bistro { sync: true } → { done, copied, removed, skipped? }
//   For migrated accounts: brings across what an older app version changed in
//   the legacy library since the last copy (see planLegacySync). Called in the
//   background on launch; throttled per account.
//
// Both record every legacy doc they copy in a ledger at
// users/{uid}/legacyLedger/{collection}~{id}, so the sync can tell a doc
// deleted in the new app from one that is new in the old app.

// Recipes embed base64 cover/original images and can each approach
// Firestore's 1 MiB doc limit, while a batch commit is capped at ~10 MiB, so
// they go a few at a time. Everything else is small.
const COLLECTIONS: { name: string; batch: number }[] = [
  { name: 'recipes', batch: 5 },
  { name: 'mealEntries', batch: 400 },
  { name: 'shoppingItems', batch: 400 },
  { name: 'pantryItems', batch: 400 },
  { name: 'categoryOverrideLogs', batch: 400 },
];

const TIME_BUDGET_MS = 40_000;
const SYNC_INTERVAL_MS = 10 * 60_000;

interface Progress {
  index: number; // position in COLLECTIONS
  cursor: string | null; // last doc id copied in that collection
  copied: number;
  startedAt: Timestamp; // server time the run began
}

/** Firestore write times have microsecond precision; keep all of it. */
const micros = (t: Timestamp) => t.seconds * 1_000_000 + Math.floor(t.nanoseconds / 1000);

const ledgerCol = (userDoc: DocumentReference) => userDoc.collection('legacyLedger');
const ledgerId = (name: string, id: string) => `${name}~${id}`;

interface Ctx {
  db: Firestore;
  userDoc: DocumentReference;
  bistroDoc: DocumentReference;
  accessRef: DocumentReference;
  started: number;
}

const overBudget = (ctx: Ctx) => Date.now() - ctx.started > TIME_BUDGET_MS;

async function migrate(ctx: Ctx, uid: string, restart: boolean) {
  const { db, userDoc, bistroDoc, accessRef } = ctx;
  const progressRef = userDoc.collection('meta').doc('bistroMigration');

  if ((await accessRef.get()).data()?.migratedAt) return { done: true, copied: 0 };

  let progress = restart ? undefined : ((await progressRef.get()).data() as Progress | undefined);
  if (!progress?.startedAt) {
    // Stamp the start in server time: it's the baseline later syncs use to
    // spot legacy docs written after this copy began.
    const fresh = { index: 0, cursor: null, copied: 0 };
    const { writeTime } = await progressRef.set(fresh);
    progress = { ...fresh, startedAt: writeTime };
  }

  while (progress.index < COLLECTIONS.length) {
    const { name, batch: size } = COLLECTIONS[progress.index];
    let query = userDoc.collection(name).orderBy(FieldPath.documentId()).limit(size);
    if (progress.cursor) query = query.startAfter(progress.cursor);
    const snap = await query.get();

    if (snap.empty) {
      progress.index += 1;
      progress.cursor = null;
      continue;
    }

    const batch = db.batch();
    for (const d of snap.docs) batch.set(bistroDoc.collection(name).doc(d.id), d.data());
    const results = await batch.commit();
    const ledger = db.batch();
    snap.docs.forEach((d, i) =>
      ledger.set(ledgerCol(userDoc).doc(ledgerId(name, d.id)), {
        c: name,
        id: d.id,
        legacy: d.updateTime,
        bistro: results[i].writeTime,
      }),
    );
    await ledger.commit();
    progress.cursor = snap.docs[snap.docs.length - 1].id;
    progress.copied += snap.size;

    // Checked after a batch, not before, so every call makes progress.
    if (overBudget(ctx)) {
      await progressRef.set(progress);
      return { done: false, copied: progress.copied };
    }
  }

  // knownSources is shared bistro data; geminiApiKeyEncrypted is personal
  // and deliberately stays behind in users/{uid}/meta/profile.
  const knownSources = (await userDoc.collection('meta').doc('profile').get()).data()
    ?.knownSources as string[] | undefined;
  if (knownSources?.length) {
    await bistroDoc.collection('meta').doc('profile').set({ knownSources }, { merge: true });
  }

  // Cutover, with the window the copy covered (see planLegacySync).
  await accessRef.set(
    {
      bistroIds: FieldValue.arrayUnion(uid),
      migratedAt: new Date().toISOString(),
      legacySyncedFrom: progress.startedAt,
      legacyMigratedTo: FieldValue.serverTimestamp(),
      legacyLedger: true,
    },
    { merge: true },
  );
  await progressRef.delete();
  return { done: true, copied: progress.copied };
}

interface Scan {
  /** Doc id → write time (exact, for preconditions). */
  times: Map<string, Timestamp>;
  /** Earliest create time in the collection, if any. */
  firstCreated?: Timestamp;
}

/** Doc ids and write times, reading no field data. */
async function scan(ref: DocumentReference, name: string): Promise<Scan> {
  const snap = await ref.collection(name).select().get();
  let firstCreated: Timestamp | undefined;
  for (const d of snap.docs) {
    if (!firstCreated || d.createTime.toMillis() < firstCreated.toMillis()) firstCreated = d.createTime;
  }
  return { times: new Map(snap.docs.map((d) => [d.id, d.updateTime])), firstCreated };
}

const toMicros = (times: Map<string, Timestamp>) =>
  new Map([...times].map(([id, t]) => [id, micros(t)]));

/**
 * Copies one legacy doc into the bistro, provided the bistro doc is still as
 * it was when the plan was made — the app may be writing while this runs.
 * Returns the write times to record in the ledger, or null if it was skipped.
 */
async function copyDoc(
  ctx: Ctx,
  name: string,
  id: string,
  planned: Timestamp | undefined,
): Promise<{ legacy: Timestamp; bistro: Timestamp } | null> {
  const source = await ctx.userDoc.collection(name).doc(id).get();
  if (!source.exists) return null;
  const data = source.data()!;
  const target = ctx.bistroDoc.collection(name).doc(id);
  try {
    if (!planned) {
      const { writeTime } = await target.create(data); // fails if it now exists
      return { legacy: source.updateTime!, bistro: writeTime };
    }
    // A full replace, preconditioned on the doc being unchanged: update the
    // source's fields and delete any the target has that the source lacks.
    const current = await target.get();
    if (!current.exists || !current.updateTime!.isEqual(planned)) return null;
    const replacement: Record<string, unknown> = { ...data };
    for (const key of Object.keys(current.data()!)) {
      if (!(key in data)) replacement[key] = FieldValue.delete();
    }
    const { writeTime } = await target.update(replacement, { lastUpdateTime: planned });
    return { legacy: source.updateTime!, bistro: writeTime };
  } catch {
    return null; // changed in the new app meanwhile — leave it
  }
}

async function readLedger(ctx: Ctx, name: string): Promise<Map<string, LedgerEntry>> {
  const snap = await ledgerCol(ctx.userDoc).where('c', '==', name).get();
  return new Map(
    snap.docs.map((d) => {
      const { id, legacy, bistro } = d.data() as { id: string; legacy: Timestamp; bistro: Timestamp | null };
      return [id, { legacy: micros(legacy), bistro: bistro ? micros(bistro) : NOT_OURS }];
    }),
  );
}

async function sync(ctx: Ctx) {
  const { db, userDoc, bistroDoc, accessRef } = ctx;
  const access = (await accessRef.get()).data();
  if (!access?.migratedAt) return { done: false, copied: 0, removed: 0, skipped: 'not-migrated' };

  // Throttle, unless the previous pass ran out of time and has more to do.
  const lastStart = access.legacySyncStartedAt as Timestamp | undefined;
  if (lastStart && access.legacySyncDone && Date.now() - lastStart.toMillis() < SYNC_INTERVAL_MS) {
    return { done: true, copied: 0, removed: 0, skipped: 'recent' };
  }

  const { writeTime: passStart } = await accessRef.set(
    { legacySyncStartedAt: FieldValue.serverTimestamp(), legacySyncDone: false },
    { merge: true },
  );

  const scans = await Promise.all(
    COLLECTIONS.map(async ({ name }) => ({
      legacy: await scan(userDoc, name),
      bistro: await scan(bistroDoc, name),
    })),
  );

  // Accounts migrated before ledgers existed get one time-window pass, after
  // which their ledger is seeded. The window: from when the original copy
  // started — the earliest doc it created, as no new-app write can predate
  // it — to the migratedAt stamp written once it finished.
  const hasLedger = !!access.legacyLedger;
  const migratedAtMicros = Date.parse(access.migratedAt as string) * 1000;
  const migratedTo = access.legacyMigratedTo ? micros(access.legacyMigratedTo as Timestamp) : migratedAtMicros;
  const firstCopied = scans
    .map((s) => s.bistro.firstCreated)
    .filter((t): t is Timestamp => !!t)
    .reduce<number | undefined>((min, t) => (min === undefined ? micros(t) : Math.min(min, micros(t))), undefined);
  const since = access.legacySyncedFrom
    ? micros(access.legacySyncedFrom as Timestamp)
    : (firstCopied ?? migratedAtMicros);

  let copied = 0;
  let removed = 0;
  for (let c = 0; c < COLLECTIONS.length; c++) {
    const { name } = COLLECTIONS[c];
    const { legacy, bistro } = scans[c];
    const legacyMicros = toMicros(legacy.times);
    const bistroMicros = toMicros(bistro.times);
    const plan = planLegacySync({
      legacy: legacyMicros,
      bistro: bistroMicros,
      ledger: hasLedger ? await readLedger(ctx, name) : null,
      since,
      migratedTo,
    });

    const justCopied = new Map<string, number>();
    for (const id of plan.copy) {
      const result = await copyDoc(ctx, name, id, bistro.times.get(id));
      if (!result) continue;
      copied++;
      justCopied.set(id, micros(result.bistro));
      await ledgerCol(userDoc).doc(ledgerId(name, id)).set({ c: name, id, ...result });
    }

    for (const id of plan.remove) {
      try {
        // Preconditioned: a doc edited in the new app meanwhile is kept.
        await bistroDoc.collection(name).doc(id).delete({ lastUpdateTime: bistro.times.get(id)! });
        removed++;
      } catch {
        continue;
      }
      await ledgerCol(userDoc).doc(ledgerId(name, id)).delete();
    }

    for (const id of plan.forget) await ledgerCol(userDoc).doc(ledgerId(name, id)).delete();

    if (!hasLedger) {
      // Docs copied this pass already have exact entries from the copy loop.
      const seeded = seedLedger(legacyMicros, bistroMicros, justCopied, migratedTo);
      const entries = [...seeded].filter(([id]) => !justCopied.has(id));
      for (let i = 0; i < entries.length; i += 400) {
        const batch = db.batch();
        for (const [id, entry] of entries.slice(i, i + 400)) {
          batch.set(ledgerCol(userDoc).doc(ledgerId(name, id)), {
            c: name,
            id,
            legacy: legacy.times.get(id)!,
            bistro: entry.bistro === NOT_OURS ? null : bistro.times.get(id)!,
          });
        }
        await batch.commit();
      }
    }

    if (overBudget(ctx)) return { done: false, copied, removed };
  }

  const legacyProfile = await userDoc.collection('meta').doc('profile').get();
  const knownSources = legacyProfile.data()?.knownSources as string[] | undefined;
  if (knownSources?.length && micros(legacyProfile.updateTime!) > since) {
    await bistroDoc
      .collection('meta')
      .doc('profile')
      .set({ knownSources: FieldValue.arrayUnion(...knownSources) }, { merge: true });
  }

  // Only a completed pass moves the baseline (and switches on the ledger).
  await accessRef.set(
    { legacySyncedFrom: passStart, legacySyncDone: true, legacyLedger: true },
    { merge: true },
  );
  return { done: true, copied, removed };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const db = getFirestore();
  const userDoc = db.collection('users').doc(user.uid);
  const ctx: Ctx = {
    db,
    userDoc,
    bistroDoc: db.collection('bistros').doc(user.uid),
    accessRef: userDoc.collection('meta').doc('bistroAccess'),
    started: Date.now(),
  };

  try {
    const result = req.body?.sync ? await sync(ctx) : await migrate(ctx, user.uid, !!req.body?.restart);
    return res.status(200).json(result);
  } catch (err) {
    console.error('migrate-bistro error:', err);
    return res.status(500).json({ error: 'Could not set up your bistro. Please try again.' });
  }
}
