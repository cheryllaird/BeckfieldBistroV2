import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getUser, type AuthedUser } from './_utils/auth.js';
import {
  checkAccept,
  checkInvite,
  checkMember,
  checkName,
  checkRemove,
  defaultBistroName,
  normalizeEmail,
  type BistroDoc,
  type Rejection,
} from './_utils/bistroRules.js';

// Bistro membership. Every membership change goes through here with the admin
// SDK: firestore.rules deny all client writes to bistros/{id} and give the
// client no access at all to bistroInvites, because both sides of a membership
// change (the bistro's member list and the member's own access list) must be
// written together, and one of them always belongs to someone else.
//
//   GET  /api/bistro                  → { invites }   invites addressed to me
//   GET  /api/bistro?bistroId=<id>    → { invites }   pending invites for a bistro I'm in
//   POST /api/bistro { action, … }    → rename | invite | accept | decline | revoke | remove | leave

const bistroRef = (db: Firestore, id: string) => db.collection('bistros').doc(id);
const accessRef = (db: Firestore, uid: string) =>
  db.collection('users').doc(uid).collection('meta').doc('bistroAccess');
const invitesCol = (db: Firestore) => db.collection('bistroInvites');

const memberEntry = (user: AuthedUser) => ({
  name: user.name,
  email: user.email,
  ...(user.avatar ? { avatar: user.avatar } : {}),
  joinedAt: new Date().toISOString(),
});

/**
 * Returns the bistro, creating the caller's own on first use. A user's own
 * bistro works before its doc exists (rules grant bistros/{uid}/… to uid
 * directly), so the doc is only created once there's something to record:
 * a name, or a second member.
 */
async function loadBistro(
  db: Firestore,
  user: AuthedUser,
  bistroId: string,
): Promise<BistroDoc | null> {
  const ref = bistroRef(db, bistroId);
  if (bistroId !== user.uid) {
    const snap = await ref.get();
    return snap.exists ? (snap.data() as BistroDoc) : null;
  }
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return snap.data() as BistroDoc;
    const created: BistroDoc = {
      name: defaultBistroName(user.name),
      ownerUid: user.uid,
      createdAt: new Date().toISOString(),
      memberUids: [user.uid],
      members: { [user.uid]: memberEntry(user) },
    };
    tx.set(ref, created);
    return created;
  });
}

class HttpError extends Error {
  constructor(readonly rejection: Rejection) {
    super(rejection.error);
  }
}
const reject = (r: Rejection | null) => {
  if (r) throw new HttpError(r);
};

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

async function handlePost(db: Firestore, user: AuthedUser, body: Record<string, unknown>) {
  const action = str(body.action);

  switch (action) {
    case 'rename': {
      const bistroId = str(body.bistroId);
      reject(checkName(body.name));
      reject(checkMember(await loadBistro(db, user, bistroId), user.uid));
      await bistroRef(db, bistroId).update({ name: str(body.name).trim() });
      return { ok: true };
    }

    case 'invite': {
      const bistroId = str(body.bistroId);
      const email = normalizeEmail(body.email);
      // Your own bistro must have finished moving to bistros/{uid}/… before
      // anyone else is let in, or they'd open an empty library.
      if (bistroId === user.uid) {
        const access = await accessRef(db, user.uid).get();
        if (!access.data()?.migratedAt) {
          reject({ status: 409, error: 'Your bistro is still being set up. Try again shortly.' });
        }
      }
      const bistro = await loadBistro(db, user, bistroId);
      const pending = bistro
        ? (await invitesCol(db).where('bistroId', '==', bistroId).get()).docs.map(
            (d) => d.data().toEmail as string,
          )
        : [];
      reject(checkInvite(bistro, user.uid, user.email, email, pending));
      const ref = await invitesCol(db).add({
        bistroId,
        bistroName: bistro!.name,
        fromUid: user.uid,
        fromName: user.name,
        ...(user.avatar ? { fromAvatar: user.avatar } : {}),
        toEmail: email,
        createdAt: new Date().toISOString(),
      });
      return { id: ref.id };
    }

    case 'accept': {
      const inviteRef = invitesCol(db).doc(str(body.inviteId));
      // One transaction so a revoke or a second accept racing this one sees
      // either the invite or its absence, never half a membership.
      const bistroId = await db.runTransaction(async (tx) => {
        const inviteSnap = await tx.get(inviteRef);
        const invite = inviteSnap.exists ? (inviteSnap.data() as { toEmail: string; bistroId: string }) : null;
        reject(checkAccept(invite, user.email));
        const ref = bistroRef(db, invite!.bistroId);
        const bistroSnap = await tx.get(ref);
        if (!bistroSnap.exists) reject({ status: 404, error: 'That bistro no longer exists.' });
        tx.update(ref, {
          memberUids: FieldValue.arrayUnion(user.uid),
          [`members.${user.uid}`]: memberEntry(user),
        });
        tx.set(
          accessRef(db, user.uid),
          { bistroIds: FieldValue.arrayUnion(invite!.bistroId) },
          { merge: true },
        );
        tx.delete(inviteRef);
        return invite!.bistroId;
      });
      return { bistroId };
    }

    case 'decline': {
      const ref = invitesCol(db).doc(str(body.inviteId));
      const snap = await ref.get();
      reject(checkAccept(snap.exists ? (snap.data() as { toEmail: string }) : null, user.email));
      await ref.delete();
      return { ok: true };
    }

    case 'revoke': {
      const ref = invitesCol(db).doc(str(body.inviteId));
      const snap = await ref.get();
      if (!snap.exists) return { ok: true }; // already gone — same outcome
      const bistroId = snap.data()!.bistroId as string;
      reject(checkMember(await loadBistro(db, user, bistroId), user.uid));
      await ref.delete();
      return { ok: true };
    }

    case 'remove':
    case 'leave': {
      const bistroId = str(body.bistroId);
      const targetUid = action === 'leave' ? user.uid : str(body.uid);
      const ref = bistroRef(db, bistroId);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        reject(checkRemove(snap.exists ? (snap.data() as BistroDoc) : null, bistroId, user.uid, targetUid));
        tx.update(ref, {
          memberUids: FieldValue.arrayRemove(targetUid),
          [`members.${targetUid}`]: FieldValue.delete(),
        });
        tx.set(
          accessRef(db, targetUid),
          { bistroIds: FieldValue.arrayRemove(bistroId) },
          { merge: true },
        );
      });
      return { ok: true };
    }

    default:
      reject({ status: 400, error: 'Unknown action' });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const db = getFirestore();

  try {
    if (req.method === 'GET') {
      const bistroId = typeof req.query.bistroId === 'string' ? req.query.bistroId : '';
      if (bistroId) {
        reject(checkMember(await loadBistro(db, user, bistroId), user.uid));
        const snap = await invitesCol(db).where('bistroId', '==', bistroId).get();
        return res.status(200).json({ invites: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
      }
      if (!user.email) return res.status(200).json({ invites: [] });
      const snap = await invitesCol(db).where('toEmail', '==', user.email).get();
      return res.status(200).json({ invites: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
    }

    if (req.method === 'POST') {
      const result = await handlePost(db, user, (req.body ?? {}) as Record<string, unknown>);
      return res.status(200).json(result);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.rejection.status).json({ error: err.rejection.error });
    }
    console.error('bistro error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
