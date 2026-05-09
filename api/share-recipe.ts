import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function initFirebaseAdmin() {
  if (getApps().length > 0) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT env var is not set');
  initializeApp({ credential: cert(JSON.parse(raw)) });
}

async function getUser(req: VercelRequest): Promise<{ uid: string; email: string } | null> {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  if (!token) return null;
  try {
    initFirebaseAdmin();
    const decoded = await getAuth().verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email ?? '' };
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const db = getFirestore();

  // POST /api/share-recipe — create a new share
  if (req.method === 'POST') {
    const share = req.body as Record<string, unknown>;
    if (!share || share.fromUid !== user.uid) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    try {
      const ref = await db.collection('sharedRecipes').add(share);
      return res.status(200).json({ id: ref.id });
    } catch (err) {
      console.error('share-recipe POST error:', err);
      return res.status(500).json({ error: 'Failed to send share' });
    }
  }

  // GET /api/share-recipe — fetch incoming shares for the authenticated user
  if (req.method === 'GET') {
    if (!user.email) return res.status(200).json({ shares: [] });
    try {
      const snap = await db.collection('sharedRecipes')
        .where('toEmail', '==', user.email)
        .get();
      const shares = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return res.status(200).json({ shares });
    } catch (err) {
      console.error('share-recipe GET error:', err);
      return res.status(500).json({ error: 'Failed to fetch shares' });
    }
  }

  // DELETE /api/share-recipe?id=<shareId> — delete a share (accept or dismiss)
  if (req.method === 'DELETE') {
    const id = typeof req.query.id === 'string' ? req.query.id : null;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    try {
      const ref = db.collection('sharedRecipes').doc(id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Not found' });
      const data = snap.data()!;
      if (data.fromUid !== user.uid && data.toEmail !== user.email) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      await ref.delete();
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('share-recipe DELETE error:', err);
      return res.status(500).json({ error: 'Failed to delete share' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
