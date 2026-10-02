// Pure membership rules for api/bistro.ts, kept free of Firebase so they can be
// unit-tested. Every guard returns null when the action is allowed, or the
// HTTP status + message to reject it with.

export interface BistroDoc {
  name: string;
  ownerUid: string;
  createdAt: string;
  memberUids: string[];
  members: Record<string, { name: string; email: string; avatar?: string; joinedAt: string }>;
}

export interface Rejection {
  status: number;
  error: string;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_BISTRO_NAME = 60;

export const normalizeEmail = (email: unknown): string =>
  typeof email === 'string' ? email.trim().toLowerCase() : '';

export function defaultBistroName(displayName: string): string {
  const first = displayName.trim().split(/\s+/)[0];
  return first && !first.includes('@') ? `${first}'s Bistro` : 'My Bistro';
}

export function checkName(name: unknown): Rejection | null {
  if (typeof name !== 'string' || !name.trim()) {
    return { status: 400, error: 'Please enter a name.' };
  }
  if (name.trim().length > MAX_BISTRO_NAME) {
    return { status: 400, error: `Names can be at most ${MAX_BISTRO_NAME} characters.` };
  }
  return null;
}

export function checkMember(bistro: BistroDoc | null, uid: string): Rejection | null {
  if (!bistro || !bistro.memberUids.includes(uid)) {
    return { status: 403, error: "You're not a member of this bistro." };
  }
  return null;
}

export function checkInvite(
  bistro: BistroDoc | null,
  callerUid: string,
  callerEmail: string,
  email: string,
  pendingEmails: string[],
): Rejection | null {
  const notMember = checkMember(bistro, callerUid);
  if (notMember) return notMember;
  if (!EMAIL_RE.test(email)) return { status: 400, error: 'Please enter a valid email address.' };
  if (email === callerEmail) return { status: 400, error: "You can't invite yourself." };
  const alreadyMember = Object.values(bistro!.members).some(
    (m) => m.email.toLowerCase() === email,
  );
  if (alreadyMember) return { status: 400, error: 'They are already a member of this bistro.' };
  if (pendingEmails.includes(email)) {
    return { status: 409, error: "They've already been invited." };
  }
  return null;
}

/**
 * Anyone in a bistro can remove anyone else, except the owner: bistros/{uid}
 * is their home and the fallback every client returns to, so it can never be
 * taken away from them. `leave` is removal of yourself, under the same rules.
 */
export function checkRemove(
  bistro: BistroDoc | null,
  bistroId: string,
  callerUid: string,
  targetUid: string,
): Rejection | null {
  const notMember = checkMember(bistro, callerUid);
  if (notMember) return notMember;
  if (targetUid === bistroId) {
    return callerUid === targetUid
      ? { status: 400, error: "You can't leave your own bistro." }
      : { status: 400, error: "The bistro's owner can't be removed." };
  }
  if (!bistro!.memberUids.includes(targetUid)) {
    return { status: 404, error: "They're not a member of this bistro." };
  }
  return null;
}

export function checkAccept(
  invite: { toEmail: string } | null,
  callerEmail: string,
): Rejection | null {
  if (!invite) return { status: 404, error: 'This invite is no longer available.' };
  if (!callerEmail || invite.toEmail !== callerEmail) {
    return { status: 403, error: 'This invite was sent to a different account.' };
  }
  return null;
}
