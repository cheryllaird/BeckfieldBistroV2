import { auth } from './firebase';
import type { Bistro, BistroInvite } from '../types';

// Client for /api/bistro and /api/migrate-bistro. Membership lives server-side
// (see api/bistro.ts for why); these wrappers only attach the ID token and
// surface the server's error message.

async function call<T>(path: string, init?: { method: 'POST'; body: unknown }): Promise<T> {
  if (!auth?.currentUser) throw new Error('Not signed in');
  const token = await auth.currentUser.getIdToken();
  const res = await fetch(path, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(init ? { body: JSON.stringify(init.body) } : {}),
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? 'Something went wrong. Please try again.');
  return body;
}

const post = <T = { ok: true }>(body: Record<string, unknown>) =>
  call<T>('/api/bistro', { method: 'POST', body });

export const fetchIncomingInvites = () =>
  call<{ invites: BistroInvite[] }>('/api/bistro').then((r) => r.invites);

export const fetchBistroInvites = (bistroId: string) =>
  call<{ invites: BistroInvite[] }>(`/api/bistro?bistroId=${encodeURIComponent(bistroId)}`).then(
    (r) => r.invites,
  );

export const renameBistro = (bistroId: string, name: string) =>
  post({ action: 'rename', bistroId, name });

export const inviteMember = (bistroId: string, email: string) =>
  post<{ id: string }>({ action: 'invite', bistroId, email });

export const acceptInvite = (inviteId: string) =>
  post<{ bistroId: string }>({ action: 'accept', inviteId }).then((r) => r.bistroId);

export const declineInvite = (inviteId: string) => post({ action: 'decline', inviteId });

export const revokeInvite = (inviteId: string) => post({ action: 'revoke', inviteId });

export const removeMember = (bistroId: string, uid: string) =>
  post({ action: 'remove', bistroId, uid });

export const leaveBistro = (bistroId: string) => post({ action: 'leave', bistroId });

/** One round of the resumable copy; call until `done`. The first round of a run passes `restart`. */
export const migrateBistroStep = (restart: boolean) =>
  call<{ done: boolean; copied: number }>('/api/migrate-bistro', {
    method: 'POST',
    body: { restart },
  });

/**
 * One pass of bringing across edits an older app version made to the legacy
 * library since the copy (see api/_utils/legacySync.ts). Call until `done`.
 */
export const syncLegacyStep = () =>
  call<{ done: boolean; copied: number; removed: number; skipped?: string }>(
    '/api/migrate-bistro',
    { method: 'POST', body: { sync: true } },
  );

/** Mirrors defaultBistroName in api/_utils/bistroRules.ts. */
export function defaultBistroName(displayName: string): string {
  const first = displayName.trim().split(/\s+/)[0];
  return first && !first.includes('@') ? `${first}'s Bistro` : 'My Bistro';
}

/**
 * A user's own bistro before its doc exists — it's only created server-side
 * once it's renamed or someone is invited, but it works from the start.
 */
export function placeholderBistro(user: {
  uid: string;
  name: string;
  email: string;
  avatar?: string;
}): Bistro {
  return {
    id: user.uid,
    name: defaultBistroName(user.name),
    ownerUid: user.uid,
    createdAt: '',
    memberUids: [user.uid],
    members: {
      [user.uid]: { name: user.name, email: user.email, avatar: user.avatar, joinedAt: '' },
    },
  };
}
