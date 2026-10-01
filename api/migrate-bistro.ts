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
import { planLegacySync } from './_utils/legacySync.js';

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
    await batch.commit();
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
    },
    { merge: true },
  );
  await progressRef.delete();
  return { done: true, copied: progress.copied };
}

/**
 * Doc id → server write time, reading no field data. Kept as Timestamps:
 * preconditions need the exact value, which has sub-millisecond precision.
 */
async function writeTimes(ref: DocumentReference, name: string): Promise<Map<string, Timestamp>> {
  const snap = await ref.collection(name).select().get();
  return new Map(snap.docs.map((d) => [d.id, d.updateTime]));
}

const toMillis = (times: Map<string, Timestamp>) =>
  new Map([...times].map(([id, t]) => [id, t.toMillis()]));

async function sync(ctx: Ctx) {
  const { db, userDoc, bistroDoc, accessRef } = ctx;
  const access = (await accessRef.get()).data();
  if (!access?.migratedAt) return { done: false, copied: 0, removed: 0, skipped: 'not-migrated' };

  // Throttle, unless the previous pass ran out of time and has more to do.
  const lastStart = access.legacySyncStartedAt as Timestamp | undefined;
  const syncedFrom = access.legacySyncedFrom as Timestamp | undefined;
  if (lastStart && access.legacySyncDone && Date.now() - lastStart.toMillis() < SYNC_INTERVAL_MS) {
    return { done: true, copied: 0, removed: 0, skipped: 'recent' };
  }

  // Accounts migrated before these baselines existed fall back to the
  // migratedAt stamp, which was written just after the copy finished.
  const migratedAtMs = Date.parse(access.migratedAt as string);
  const since = syncedFrom?.toMillis() ?? migratedAtMs - 60_000;
  const migratedTo = (access.legacyMigratedTo as Timestamp | undefined)?.toMillis() ?? migratedAtMs;

  const { writeTime: passStart } = await accessRef.set(
    { legacySyncStartedAt: FieldValue.serverTimestamp(), legacySyncDone: false },
    { merge: true },
  );

  let copied = 0;
  let removed = 0;
  for (const { name, batch: size } of COLLECTIONS) {
    const [legacy, bistro] = await Promise.all([
      writeTimes(userDoc, name),
      writeTimes(bistroDoc, name),
    ]);
    const plan = planLegacySync(toMillis(legacy), toMillis(bistro), since, migratedTo);

    // The app may be writing to the bistro while this runs, so each copy
    // re-checks the bistro doc inside a transaction and leaves it alone if it
    // changed since the plan was made.
    for (let i = 0; i < plan.copy.length; i += size) {
      const ids = plan.copy.slice(i, i + size);
      copied += await db.runTransaction(async (tx) => {
        const targets = ids.map((id) => bistroDoc.collection(name).doc(id));
        const current = await tx.getAll(...targets);
        const sources = await tx.getAll(...ids.map((id) => userDoc.collection(name).doc(id)));
        let n = 0;
        ids.forEach((id, k) => {
          const planned = bistro.get(id);
          const now = current[k].exists ? current[k].updateTime : undefined;
          const unchanged = planned && now ? planned.isEqual(now) : planned === now;
          if (!unchanged || !sources[k].exists) return;
          tx.set(targets[k], sources[k].data()!);
          n++;
        });
        return n;
      });
    }

    // Deletes are preconditioned on the doc being unchanged since planning.
    for (const id of plan.remove) {
      const ref = bistroDoc.collection(name).doc(id);
      try {
        await ref.delete({ lastUpdateTime: bistro.get(id)! });
        removed++;
      } catch {
        // Edited in the new app meanwhile — keep it.
      }
    }

    if (overBudget(ctx)) return { done: false, copied, removed };
  }

  const legacyProfile = await userDoc.collection('meta').doc('profile').get();
  const knownSources = legacyProfile.data()?.knownSources as string[] | undefined;
  if (knownSources?.length && legacyProfile.updateTime!.toMillis() > since) {
    await bistroDoc
      .collection('meta')
      .doc('profile')
      .set({ knownSources: FieldValue.arrayUnion(...knownSources) }, { merge: true });
  }

  // Only a completed pass moves the baseline.
  await accessRef.set({ legacySyncedFrom: passStart, legacySyncDone: true }, { merge: true });
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
