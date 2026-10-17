import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, type Firestore, type Query } from 'firebase-admin/firestore';
import { getUser } from './_utils/auth.js';
import { checkRecentSignIn, membersToDetach } from './_utils/accountDeletion.js';
import type { BistroDoc } from './_utils/bistroRules.js';

// POST /api/delete-account — permanently deletes the caller's account and the
// personal data it holds:
//
//   - their own bistro (bistros/{uid} and everything under it), which also
//     removes it from every other member's access list;
//   - their membership of other people's bistros (what they added there stays,
//     as it belongs to that bistro);
//   - everything under users/{uid} (API key, access list, pre-bistro library);
//   - invites and shared recipes they sent or that were addressed to them;
//   - finally their Firebase Auth user.
//
// Every step is idempotent and the Auth user goes last, so a failure part-way
// leaves an account that can sign in and run this again.

async function deleteMatching(query: Query): Promise<number> {
  const snap = await query.get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
  return snap.size;
}

async function deleteAccountData(db: Firestore, uid: string, email: string): Promise<void> {
  // 1. Leave other people's bistros.
  const joined = await db.collection('bistros').where('memberUids', 'array-contains', uid).get();
  await Promise.all(
    joined.docs
      .filter((d) => d.id !== uid)
      .map((d) =>
        d.ref.update({
          memberUids: FieldValue.arrayRemove(uid),
          [`members.${uid}`]: FieldValue.delete(),
        }),
      ),
  );

  // 2. Delete the own bistro, detaching its other members first so their
  //    clients fall back to their own bistro rather than a missing one.
  const ownRef = db.collection('bistros').doc(uid);
  const own = await ownRef.get();
  const detach = membersToDetach(own.exists ? (own.data() as BistroDoc) : null, uid);
  await Promise.all(
    detach.map((m) =>
      db
        .collection('users')
        .doc(m)
        .collection('meta')
        .doc('bistroAccess')
        .set({ bistroIds: FieldValue.arrayRemove(uid) }, { merge: true }),
    ),
  );
  await db.recursiveDelete(ownRef);

  // 3. Invites and shares, sent or received.
  const invites = db.collection('bistroInvites');
  const shares = db.collection('sharedRecipes');
  await Promise.all([
    deleteMatching(invites.where('fromUid', '==', uid)),
    deleteMatching(invites.where('bistroId', '==', uid)),
    deleteMatching(shares.where('fromUid', '==', uid)),
    ...(email
      ? [deleteMatching(invites.where('toEmail', '==', email)), deleteMatching(shares.where('toEmail', '==', email))]
      : []),
  ]);

  // 4. Personal data: users/{uid} and everything under it.
  await db.recursiveDelete(db.collection('users').doc(uid));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const stale = checkRecentSignIn(user.authTime, Date.now());
  if (stale) return res.status(stale.status).json({ error: stale.error });

  try {
    await deleteAccountData(getFirestore(), user.uid, user.email);
    await getAuth().deleteUser(user.uid).catch((err: { code?: string }) => {
      if (err.code !== 'auth/user-not-found') throw err; // already gone — same outcome
    });
    console.log('delete-account: account deleted');
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('delete-account error:', err);
    return res.status(500).json({ error: 'Could not delete your account. Please try again.' });
  }
}
