// Read-only usage report: prints aggregate figures about how Beckfield Bistro
// is used, across all bistros. Never writes to Firestore, to disk or anywhere
// but stdout. Output holds no uids, bistro/recipe ids, item names or titles,
// and any group under 3 shows as "<3" (see usage-report-lib.mjs).
//
// Env:
//   FIREBASE_SERVICE_ACCOUNT  service account JSON (same as the API functions)
//
//   node scripts/usage-report.mjs

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { aggregateUsage } from './usage-report-lib.mjs';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT is not set');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();

// Field masks keep reads small: recipes hold large images, so select nothing
// and rely on updateTime. select() with no fields returns empty data.
const times = async (ref) => {
  const snap = await ref.select().get();
  return snap.docs.map((d) => ({ updateTime: d.updateTime.toMillis() }));
};
const withFields = async (ref, fields) => {
  const snap = await ref.select(...fields).get();
  return snap.docs.map((d) => ({ ...d.data(), updateTime: d.updateTime.toMillis() }));
};

const analyticsSnap = await db.collection('analytics').get();
const extraction = { lifetime: undefined, daily: [] };
for (const d of analyticsSnap.docs) {
  if (d.id === 'extractionStats') extraction.lifetime = d.data();
  else if (d.id.startsWith('extractionStats-')) extraction.daily.push(d.data());
}

// The parent bistros/{id} doc may not exist, so list by reference.
const bistroRefs = await db.collection('bistros').listDocuments();
const bistros = [];
for (const ref of bistroRefs) {
  const [recipes, mealEntries, pantryItems, shoppingItems, categoryLogs, parent] = await Promise.all([
    times(ref.collection('recipes')),
    withFields(ref.collection('mealEntries'), ['type', 'recipeId']),
    withFields(ref.collection('pantryItems'), ['inStock']),
    times(ref.collection('shoppingItems')),
    withFields(ref.collection('categoryOverrideLogs'), ['ingredientKey', 'source', 'fromCategory', 'toCategory']),
    ref.get(),
  ]);
  const memberUids = parent.exists ? parent.data()?.memberUids : undefined;
  bistros.push({
    memberCount: Array.isArray(memberUids) ? memberUids.length : 1,
    recipes,
    mealEntries,
    pantryItems,
    shoppingItems,
    categoryLogs,
  });
}

// Unmigrated accounts: users/{uid} docs still holding a library. Counted only.
const userRefs = await db.collection('users').listDocuments();
let unmigratedUsers = 0;
for (const ref of userRefs) {
  const profile = await ref.collection('meta').doc('bistroAccess').get();
  if (!profile.exists || !profile.data()?.migratedAt) unmigratedUsers++;
}

console.log(JSON.stringify(aggregateUsage({ extraction, bistros, unmigratedUsers }), null, 2));
