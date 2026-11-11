import { createHash } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getUser } from './_utils/auth.js';
import { createRateLimiter, parseTrack } from './_utils/trackRules.js';

// POST /api/track — anonymous usage counters (ADR 0019). Body: { event, value },
// both from the allow-list in trackRules.ts. Each accepted event adds one to
// `counts.<event>.<value>` in analytics/usage (lifetime) and
// analytics/usage-YYYY-MM-DD (daily). Sign-in is required so only app users
// can count, but the uid is never stored or logged: it is only hashed for the
// in-memory rate limit, which lives and dies with this function instance.

const allow = createRateLimiter();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const count = parseTrack(req.body);
  if (!count) return res.status(400).json({ error: 'Unknown event' });

  // Over the limit: drop quietly. Counters are best-effort and the client
  // ignores the response anyway.
  const caller = createHash('sha256').update(user.uid).digest('base64url');
  if (!allow(caller)) return res.status(204).end();

  try {
    const db = getFirestore();
    const inc = FieldValue.increment(1);
    const day = new Date().toISOString().slice(0, 10);
    // Nested maps (not dotted field paths) built only from allow-listed strings.
    const counts = { [count.event]: { [count.value]: inc } };
    await Promise.all([
      db.collection('analytics').doc('usage').set(
        { counts, total: inc, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      ),
      db.collection('analytics').doc(`usage-${day}`).set({ counts, total: inc, date: day }, { merge: true }),
    ]);
  } catch (err) {
    console.error('Failed to record usage count:', err instanceof Error ? err.message : String(err));
  }
  return res.status(204).end();
}
