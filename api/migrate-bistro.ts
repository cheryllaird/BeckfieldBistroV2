import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore, FieldPath, FieldValue } from 'firebase-admin/firestore';
import { getUser } from './_utils/auth.js';

// One-time copy of a pre-bistro account's library from users/{uid}/… to its
// own bistro at bistros/{uid}/…
//
// POST /api/migrate-bistro { restart?: boolean } → { done: boolean, copied: number }
//
// Resumable: each call copies until it nears its time budget, records a cursor
// in users/{uid}/meta/bistroMigration, and returns done:false; the client calls
// again until done. Copies are keyed by the same doc ids, so a retried or
// concurrent run overwrites rather than duplicates.
//
// The client holds the app on a setup screen for one run, so nothing changes
// between its rounds. A new run (restart: true) starts over rather than
// resuming: after a failed run the user may have kept editing the legacy
// paths, and docs before the old cursor would otherwise keep a stale copy.
//
// Copy, never move. The legacy docs are left in place as a rollback. The
// cutover is the migratedAt stamp on users/{uid}/meta/bistroAccess, written
// only after every collection has landed: until it exists clients keep using
// the legacy paths, so a failed or half-finished run can't lose anything.

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

interface Progress {
  index: number; // position in COLLECTIONS
  cursor: string | null; // last doc id copied in that collection
  copied: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const started = Date.now();
  const db = getFirestore();
  const userDoc = db.collection('users').doc(user.uid);
  const bistroDoc = db.collection('bistros').doc(user.uid);
  const accessRef = userDoc.collection('meta').doc('bistroAccess');
  const progressRef = userDoc.collection('meta').doc('bistroMigration');

  try {
    if ((await accessRef.get()).data()?.migratedAt) {
      return res.status(200).json({ done: true, copied: 0 });
    }

    const saved = req.body?.restart
      ? undefined
      : ((await progressRef.get()).data() as Progress | undefined);
    const progress: Progress = saved ?? { index: 0, cursor: null, copied: 0 };

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
      if (Date.now() - started > TIME_BUDGET_MS) {
        await progressRef.set(progress);
        return res.status(200).json({ done: false, copied: progress.copied });
      }
    }

    // knownSources is shared bistro data; geminiApiKeyEncrypted is personal
    // and deliberately stays behind in users/{uid}/meta/profile.
    const knownSources = (await userDoc.collection('meta').doc('profile').get()).data()
      ?.knownSources as string[] | undefined;
    if (knownSources?.length) {
      await bistroDoc.collection('meta').doc('profile').set({ knownSources }, { merge: true });
    }

    // Cutover.
    await accessRef.set(
      { bistroIds: FieldValue.arrayUnion(user.uid), migratedAt: new Date().toISOString() },
      { merge: true },
    );
    await progressRef.delete();
    return res.status(200).json({ done: true, copied: progress.copied });
  } catch (err) {
    console.error('migrate-bistro error:', err);
    return res.status(500).json({ error: 'Could not set up your bistro. Please try again.' });
  }
}
