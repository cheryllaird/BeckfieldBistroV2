import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { authState, network, authedFetch } = vi.hoisted(() => ({
  authState: { currentUser: null as unknown },
  network: { isOnline: true, isSyncing: false },
  authedFetch: vi.fn(),
}));

vi.mock('./firebase', () => ({ auth: authState }));
vi.mock('./networkStatus', () => ({ getNetworkStatus: () => network }));
vi.mock('./apiClient', () => ({ authedFetch: (...args: unknown[]) => authedFetch(...args) }));

import { currentDisplayMode, pantrySkipBucket, track, trackDisplayModeOnce } from './usage';

const user = { uid: 'u1' };

beforeEach(() => {
  vi.stubEnv('PROD', true);
  authState.currentUser = user;
  network.isOnline = true;
  authedFetch.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('track', () => {
  it('posts only the event and value, with the signed-in user’s token', async () => {
    await track({ event: 'import_started', value: 'url' });

    expect(authedFetch).toHaveBeenCalledTimes(1);
    const [sentUser, path, init] = authedFetch.mock.calls[0];
    expect(sentUser).toBe(user);
    expect(path).toBe('/api/track');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ event: 'import_started', value: 'url' });
    expect(init.body).not.toContain('u1');
  });

  it('does nothing outside production builds', async () => {
    vi.stubEnv('PROD', false);
    await track({ event: 'display_mode', value: 'browser' });
    expect(authedFetch).not.toHaveBeenCalled();
  });

  it('does nothing when signed out', async () => {
    authState.currentUser = null;
    await track({ event: 'display_mode', value: 'browser' });
    expect(authedFetch).not.toHaveBeenCalled();
  });

  it('drops the event while offline, and does not send it later', async () => {
    network.isOnline = false;
    await track({ event: 'pantry_skip', value: '1' });
    network.isOnline = true;
    await track({ event: 'pantry_skip', value: '0' });

    expect(authedFetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(authedFetch.mock.calls[0][2].body)).toEqual({ event: 'pantry_skip', value: '0' });
  });

  it('swallows request failures', async () => {
    authedFetch.mockRejectedValue(new Error('Failed to fetch'));
    await expect(track({ event: 'import_saved', value: 'photo' })).resolves.toBeUndefined();
  });
});

describe('pantrySkipBucket', () => {
  it('buckets the count', () => {
    expect([0, 1, 2, 3, 4, 6, 7, 40].map(pantrySkipBucket)).toEqual(['0', '1', '2-3', '2-3', '4-6', '4-6', '7+', '7+']);
  });
});

describe('display mode', () => {
  const stubMatch = (standalone: boolean) =>
    vi.stubGlobal('window', { matchMedia: () => ({ matches: standalone }) });

  it('reports standalone or browser', () => {
    stubMatch(true);
    expect(currentDisplayMode()).toBe('standalone');
    stubMatch(false);
    expect(currentDisplayMode()).toBe('browser');
  });

  it('is sent once per session', async () => {
    stubMatch(false);
    trackDisplayModeOnce();
    trackDisplayModeOnce();
    await vi.waitFor(() => expect(authedFetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(authedFetch.mock.calls[0][2].body)).toEqual({ event: 'display_mode', value: 'browser' });
  });
});
