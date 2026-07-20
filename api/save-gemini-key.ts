import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { encryptSecret } from './_utils/crypto';

function initFirebaseAdmin() {
  if (getApps().length > 0) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT env var is not set');
  initializeApp({ credential: cert(JSON.parse(raw)) });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  let uid: string;
  try {
    initFirebaseAdmin();
    const decoded = await getAuth().verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const { apiKey } = req.body ?? {};
  const profileRef = getFirestore().collection('users').doc(uid).collection('meta').doc('profile');

  // Empty/missing key clears whatever is stored.
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    await profileRef.set({ geminiApiKeyEncrypted: FieldValue.delete() }, { merge: true });
    return res.status(200).json({ hasKey: false });
  }

  const trimmed = apiKey.trim();
  if (trimmed.length > 500) {
    return res.status(400).json({ error: 'API key is too long' });
  }

  try {
    await profileRef.set({ geminiApiKeyEncrypted: encryptSecret(trimmed) }, { merge: true });
    return res.status(200).json({ hasKey: true });
  } catch (err) {
    console.error('save-gemini-key error:', err);
    return res.status(500).json({ error: 'Failed to save API key. Please try again.' });
  }
}
