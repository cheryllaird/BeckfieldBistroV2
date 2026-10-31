import { reauthenticateWithPopup } from 'firebase/auth';
import { clearIndexedDbPersistence, terminate } from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import { authErrorMessage } from './authErrors';
import { authedFetch } from './apiClient';

// Client for /api/delete-account. The server only deletes an account whose
// token shows a sign-in in the last few minutes, so this re-authenticates
// first (see api/_utils/accountDeletion.ts).

function errorCode(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : '';
}

export class ReauthCancelled extends Error {}

/** Confirms who's deleting with a fresh Google sign-in, then deletes the account server-side. */
export async function deleteAccountOnServer(): Promise<void> {
  const user = auth?.currentUser;
  if (!user) throw new Error('Not signed in');

  try {
    await reauthenticateWithPopup(user, googleProvider);
  } catch (err) {
    const code = errorCode(err);
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new ReauthCancelled();
    }
    if (code === 'auth/popup-blocked') {
      throw new Error(
        'Your browser blocked the Google sign-in window. Open Beckfield Bistro in your browser, rather than the home-screen app, and try again.',
      );
    }
    if (code === 'auth/user-mismatch') {
      throw new Error('Please confirm with the Google account you are signed in with.');
    }
    throw new Error(authErrorMessage(code));
  }

  const res = await authedFetch(user, '/api/delete-account', { method: 'POST' }, true);
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? "Your account wasn't deleted. Check your connection and try again.");
}

/**
 * Drops Firestore's offline copy of the deleted account's documents. This
 * shuts the Firestore instance down, so the page must reload afterwards.
 */
export async function clearFirestoreCache(): Promise<void> {
  if (!db) return;
  await terminate(db);
  await clearIndexedDbPersistence(db);
}
