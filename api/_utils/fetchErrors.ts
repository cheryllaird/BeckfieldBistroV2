import { UnsafeUrlError } from './safeFetch.js';

// Sorts a failed recipe-page fetch into what the user should be told. Some
// sites' bot protection never answers an automated request (it hangs until our
// timeout) or refuses it outright; telling the user to "check the URL" then is
// wrong, because the link is fine. Those cases get a message pointing at the
// routes that still work. Bad or blocked addresses keep "check the URL".
//
// `reason` is the analytics fallback reason (`urlFetch-<class>`); it carries no
// URL, hostname or other request data.

export type FetchFailureKind = 'blocked' | 'bad-url' | 'error';

export interface FetchFailure {
  kind: FetchFailureKind;
  reason: string;
}

export const BLOCKED_SITE_MESSAGE =
  "This site doesn't allow automatic imports. Copy the recipe text and use Paste text, or take a screenshot and use Photo.";
export const BAD_URL_MESSAGE = 'Could not fetch the recipe page. Check the URL and try again.';

/** HTTP statuses a site uses to turn away automated requests. */
const BLOCKED_STATUSES = new Set([401, 403, 429, 451, 503]);
/** HTTP statuses that mean the link itself is wrong. */
const MISSING_STATUSES = new Set([404, 410]);

const TIMEOUT_CODES = new Set(['ABORT_ERR', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT']);
const TIMEOUT_NAMES = new Set(['AbortError', 'TimeoutError']);
const REFUSED_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ECONNABORTED']);
const BAD_URL_CODES = new Set(['ENOTFOUND', 'ERR_INVALID_URL']);

/** Classifies a non-2xx response from the recipe page. */
export function classifyFetchStatus(status: number): FetchFailure {
  if (BLOCKED_STATUSES.has(status)) return { kind: 'blocked', reason: `urlFetch-http${status}` };
  if (MISSING_STATUSES.has(status)) return { kind: 'bad-url', reason: `urlFetch-http${status}` };
  // Any other status is grouped by class: the remote site picks it, so naming
  // each one would let a site add arbitrary analytics keys.
  const group = status >= 400 && status < 600 ? `${Math.floor(status / 100)}xx` : 'other';
  return { kind: 'error', reason: `urlFetch-http${group}` };
}

/** Classifies an error thrown while fetching the recipe page. */
export function classifyFetchError(err: unknown): FetchFailure {
  if (err instanceof UnsafeUrlError) return { kind: 'bad-url', reason: 'urlFetch-bad-url' };
  const e = (err ?? {}) as { name?: unknown; code?: unknown; message?: unknown };
  const name = typeof e.name === 'string' ? e.name : '';
  const code = typeof e.code === 'string' ? e.code : '';
  const message = typeof e.message === 'string' ? e.message : '';
  if (TIMEOUT_NAMES.has(name) || TIMEOUT_CODES.has(code)) {
    return { kind: 'blocked', reason: 'urlFetch-timeout' };
  }
  if (REFUSED_CODES.has(code) || /socket hang up/i.test(message)) {
    return { kind: 'blocked', reason: 'urlFetch-refused' };
  }
  if (BAD_URL_CODES.has(code)) return { kind: 'bad-url', reason: 'urlFetch-bad-url' };
  return { kind: 'error', reason: 'urlFetch-error' };
}
