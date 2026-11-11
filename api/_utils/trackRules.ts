// Pure validation for api/track.ts, kept free of Firebase so it can be
// unit-tested. Usage counters are anonymous: a request names one allow-listed
// event and one allow-listed value, nothing else. The Firestore field names
// written by the handler are always the allow-list's own strings, never text
// from the request, so no client-supplied key can reach a field path.

/** Each event and the only values it may carry. */
export const TRACK_EVENTS = {
  import_started: ['url', 'photo', 'manual'],
  import_saved: ['url', 'photo', 'manual'],
  import_abandoned: ['url', 'photo', 'manual'],
  pantry_skip: ['0', '1', '2-3', '4-6', '7+'],
  display_mode: ['standalone', 'browser'],
} as const;

export type TrackEvent = keyof typeof TRACK_EVENTS;
export type TrackValue<E extends TrackEvent = TrackEvent> = (typeof TRACK_EVENTS)[E][number];

export interface TrackCount {
  event: TrackEvent;
  value: string;
}

/** Events one signed-in user may send to one function instance per window. */
export const TRACK_LIMIT = 30;
export const TRACK_WINDOW_MS = 60_000;

const ALLOWED_KEYS = ['event', 'value'];

/**
 * The allow-listed event and value the body names, as the allow-list's own
 * strings, or null for anything else: a non-object body, extra or missing
 * keys, unknown events or values, and non-string values.
 */
export function parseTrack(body: unknown): TrackCount | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const keys = Object.keys(body);
  if (keys.length !== ALLOWED_KEYS.length || !keys.every((k) => ALLOWED_KEYS.includes(k))) return null;
  const { event, value } = body as Record<string, unknown>;
  if (typeof event !== 'string' || typeof value !== 'string') return null;
  // Look the event up among the allow-list's own entries, so names such as
  // '__proto__' or 'constructor' never resolve to an inherited property.
  const entry = Object.entries(TRACK_EVENTS).find(([name]) => name === event);
  if (!entry) return null;
  const [name, values] = entry as [TrackEvent, readonly string[]];
  const allowed = values.find((v) => v === value);
  return allowed === undefined ? null : { event: name, value: allowed };
}

/**
 * A best-effort, per-instance limit on events per caller. `key` is an opaque
 * caller key (the handler passes a hash, never the uid itself). Old entries are
 * pruned on each call so the map can't grow without bound.
 */
export function createRateLimiter(limit = TRACK_LIMIT, windowMs = TRACK_WINDOW_MS) {
  const hits = new Map<string, { start: number; count: number }>();
  return function allow(key: string, now = Date.now()): boolean {
    for (const [k, h] of hits) if (now - h.start >= windowMs) hits.delete(k);
    const h = hits.get(key);
    if (!h) {
      hits.set(key, { start: now, count: 1 });
      return true;
    }
    if (h.count >= limit) return false;
    h.count++;
    return true;
  };
}
