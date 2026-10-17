// One-off: gives shared recipes and bistro invites created before `expiresAt`
// existed the same expiry as new ones (createdAt + 90 days, matching
// api/_utils/pendingExpiry.ts), so the Firestore TTL policy deletes them too.
// Anything already past that date gets an expiry of now, so TTL removes it
// within a day.
//
// Dry run by default; pass --apply to write.
//
// Env:
//   FIREBASE_SERVICE_ACCOUNT  service account JSON (same as the API functions)
//
//   node scripts/backfill-pending-expiry.mjs [--apply]

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PENDING_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const apply = process.argv.includes('--apply');

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT is not set');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();
const now = Date.now();

for (const name of ['sharedRecipes', 'bistroInvites']) {
  const snap = await db.collection(name).get();
  let missing = 0;
  let past = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.expiresAt) continue;
    const created = Date.parse(data.createdAt ?? '');
    const expires = Number.isNaN(created) ? now + PENDING_DAYS * DAY_MS : created + PENDING_DAYS * DAY_MS;
    missing++;
    if (expires <= now) past++;
    if (apply) await doc.ref.update({ expiresAt: new Date(Math.max(expires, now)) });
  }
  console.log(
    `${name}: ${snap.size} docs, ${missing} without expiresAt (${past} already past expiry)` +
      (apply ? ' — updated' : ' — dry run, pass --apply to write'),
  );
}
