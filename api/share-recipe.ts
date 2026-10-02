import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore } from 'firebase-admin/firestore';
import { getUser } from './_utils/auth.js';
import { buildShare, checkShareQuota } from './_utils/shareRules.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const db = getFirestore();

  // POST /api/share-recipe — create a new share. The stored doc is rebuilt
  // from an allow-list (see buildShare); the body is never stored as sent.
  if (req.method === 'POST') {
    const now = new Date();
    const built = buildShare(req.body, user, now);
    if ('rejection' in built) {
      return res.status(built.rejection.status).json({ error: built.rejection.error });
    }
    try {
      const sent = await db.collection('sharedRecipes').where('fromUid', '==', user.uid).select('createdAt').get();
      const overQuota = checkShareQuota(sent.docs.map((d) => String(d.data().createdAt ?? '')), now);
      if (overQuota) return res.status(overQuota.status).json({ error: overQuota.error });
      const ref = await db.collection('sharedRecipes').add(built.share);
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
      if (data.fromUid !== user.uid && (!user.email || data.toEmail !== user.email)) {
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
