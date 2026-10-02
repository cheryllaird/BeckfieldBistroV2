import type { VercelRequest } from '@vercel/node';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export function initFirebaseAdmin() {
  if (getApps().length > 0) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT env var is not set');
  initializeApp({ credential: cert(JSON.parse(raw)) });
}

export interface AuthedUser {
  uid: string;
  /**
   * Lowercased; '' when the token carries no email or an unverified one, so an
   * account can never claim invites or shares addressed to an address it
   * hasn't proven it owns.
   */
  email: string;
  name: string;
  avatar?: string;
}

/** Verifies the `Authorization: Bearer <idToken>` header. null when absent/invalid. */
export async function getUser(req: VercelRequest): Promise<AuthedUser | null> {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  if (!token) return null;
  try {
    initFirebaseAdmin();
    const decoded = await getAuth().verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email_verified ? (decoded.email ?? '').toLowerCase() : '',
      name: (decoded.name as string | undefined) ?? decoded.email ?? 'Someone',
      avatar: decoded.picture,
    };
  } catch {
    return null;
  }
}
