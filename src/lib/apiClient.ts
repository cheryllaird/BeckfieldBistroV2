import type { User } from 'firebase/auth';

export const NETWORK_ERROR_MESSAGE = "Couldn't connect. Check your internet connection and try again.";

/** The request never reached the server: offline, a flaky connection, or the ID token couldn't refresh. */
export class NetworkError extends Error {
  constructor() {
    super(NETWORK_ERROR_MESSAGE);
    this.name = 'NetworkError';
  }
}

// fetch rejects with a TypeError ("Failed to fetch", "Load failed", …) only when
// the request couldn't be made; Firebase reports a failed token refresh by code.
function isNetworkFailure(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'auth/network-request-failed';
}

/**
 * Calls one of our `api/` endpoints with the user's ID token attached. Network
 * failures become a NetworkError with a readable message, so the browser's raw
 * "Failed to fetch" never reaches the UI. Other errors pass through unchanged.
 */
export async function authedFetch(
  user: User,
  path: string,
  init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {},
  forceRefresh = false,
): Promise<Response> {
  try {
    const token = await user.getIdToken(forceRefresh);
    return await fetch(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  } catch (e) {
    if (isNetworkFailure(e)) throw new NetworkError();
    throw e;
  }
}
