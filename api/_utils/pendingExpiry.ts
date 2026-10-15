// Shared recipes and bistro invites hold the email address of someone who may
// never sign in. They are kept for PENDING_DAYS, then deleted: the docs carry
// an `expiresAt` timestamp that a Firestore TTL policy on each collection
// deletes after (see README → "Firestore TTL policies"). TTL deletion can lag
// by up to a day, so reads also skip anything past its expiry.

export const PENDING_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/** When a share or invite created at `createdAt` expires. */
export function pendingExpiry(createdAt: Date): Date {
  return new Date(createdAt.getTime() + PENDING_DAYS * DAY_MS);
}

/**
 * True once a share or invite is past its expiry. Judged from `createdAt`
 * (ISO), which every doc has, so docs written before `expiresAt` existed
 * expire on the same schedule. An unreadable date never expires.
 */
export function isPendingExpired(createdAt: unknown, now: Date): boolean {
  const created = typeof createdAt === 'string' ? Date.parse(createdAt) : NaN;
  return !Number.isNaN(created) && pendingExpiry(new Date(created)) <= now;
}

/** Drops expired docs and the internal `expiresAt` field from an API response. */
export function livePending<T extends { createdAt?: unknown; expiresAt?: unknown }>(
  docs: T[],
  now: Date,
): Omit<T, 'expiresAt'>[] {
  return docs
    .filter((d) => !isPendingExpired(d.createdAt, now))
    .map((d) => {
      const rest: Omit<T, 'expiresAt'> & { expiresAt?: unknown } = { ...d };
      delete rest.expiresAt;
      return rest;
    });
}
