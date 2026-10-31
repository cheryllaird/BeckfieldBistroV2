import { afterEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import { authedFetch, NetworkError, NETWORK_ERROR_MESSAGE } from './apiClient';

function fakeUser(getIdToken: (force?: boolean) => Promise<string>): User {
  return { getIdToken } as unknown as User;
}

const okUser = () => fakeUser(vi.fn().mockResolvedValue('tok'));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('authedFetch', () => {
  it('attaches the ID token alongside the caller’s headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);

    await authedFetch(okUser(), '/api/x', { method: 'POST', headers: { 'Content-Type': 'application/json' } });

    expect(fetchMock).toHaveBeenCalledWith('/api/x', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
    });
  });

  it('passes forceRefresh through to getIdToken', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
    const getIdToken = vi.fn().mockResolvedValue('tok');

    await authedFetch(fakeUser(getIdToken), '/api/x', {}, true);

    expect(getIdToken).toHaveBeenCalledWith(true);
  });

  it('returns non-ok responses for the caller to handle', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));

    const res = await authedFetch(okUser(), '/api/x');

    expect(res.status).toBe(500);
  });

  it.each(['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.'])(
    'turns a fetch network failure (%s) into a readable NetworkError',
    async (raw) => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError(raw)));

      const err = await authedFetch(okUser(), '/api/x').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(NetworkError);
      expect((err as Error).message).toBe(NETWORK_ERROR_MESSAGE);
    },
  );

  it('turns a token refresh that fails offline into a NetworkError', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = fakeUser(vi.fn().mockRejectedValue(Object.assign(new Error('Firebase: Error (auth/network-request-failed).'), {
      code: 'auth/network-request-failed',
    })));

    await expect(authedFetch(user, '/api/x')).rejects.toBeInstanceOf(NetworkError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets other errors through unchanged', async () => {
    const original = new Error('user-token-expired');
    vi.stubGlobal('fetch', vi.fn());

    await expect(authedFetch(fakeUser(vi.fn().mockRejectedValue(original)), '/api/x')).rejects.toBe(original);
  });
});
