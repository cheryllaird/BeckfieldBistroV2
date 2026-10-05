import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useOnlineStatus } from './useOnlineStatus';
import { waitForServerSync } from '../lib/firestore';

vi.mock('../lib/firestore');

const goOnline = () => act(() => void window.dispatchEvent(new Event('online')));
const goOffline = () => act(() => void window.dispatchEvent(new Event('offline')));

// A drain the test settles by hand, standing in for waitForPendingWrites.
function deferSync() {
  let resolve!: () => void;
  vi.mocked(waitForServerSync).mockReturnValueOnce(new Promise<void>((r) => (resolve = r)));
  return { settle: () => act(async () => resolve()) };
}

describe('useOnlineStatus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts from navigator.onLine', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toEqual({ isOnline: false, isSyncing: false });
  });

  it('stays syncing after reconnecting until queued writes reach the server', async () => {
    const sync = deferSync();
    const { result } = renderHook(() => useOnlineStatus());

    goOffline();
    expect(result.current).toEqual({ isOnline: false, isSyncing: false });

    goOnline();
    expect(result.current).toEqual({ isOnline: true, isSyncing: true });

    await sync.settle();
    expect(result.current).toEqual({ isOnline: true, isSyncing: false });
  });

  it('ignores a drain that settles after the connection drops again', async () => {
    const stale = deferSync();
    const fresh = deferSync();
    const { result } = renderHook(() => useOnlineStatus());

    goOnline();
    goOffline();
    goOnline();

    await stale.settle();
    expect(result.current).toEqual({ isOnline: true, isSyncing: true });

    await fresh.settle();
    expect(result.current.isSyncing).toBe(false);
  });

  it('shows offline, not syncing, if the connection drops mid-sync', () => {
    deferSync();
    const { result } = renderHook(() => useOnlineStatus());

    goOnline();
    goOffline();

    expect(result.current).toEqual({ isOnline: false, isSyncing: false });
  });

  it('removes its listeners on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useOnlineStatus());

    unmount();

    expect(remove).toHaveBeenCalledWith('online', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('offline', expect.any(Function));
  });
});
