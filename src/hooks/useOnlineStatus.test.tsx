import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOnlineStatus } from './useOnlineStatus';
import { waitForServerSync } from '../lib/firestore';

vi.mock('../lib/firestore');

const goOnline = () => act(() => void window.dispatchEvent(new Event('online')));
const goOffline = () => act(() => void window.dispatchEvent(new Event('offline')));
const flush = () => act(async () => {});

// A drain the test settles by hand, standing in for waitForPendingWrites.
function deferSync() {
  let resolve!: () => void;
  vi.mocked(waitForServerSync).mockReturnValueOnce(new Promise<void>((r) => (resolve = r)));
  return { settle: () => act(async () => resolve()) };
}

const probeFails = () => vi.mocked(fetch).mockRejectedValue(new TypeError('Load failed'));
const probeSucceeds = () => vi.mocked(fetch).mockResolvedValue(new Response(null));

describe('useOnlineStatus', () => {
  let onLine: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts offline when the browser says so, without probing', () => {
    onLine.mockReturnValue(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toEqual({ isOnline: false, isSyncing: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stays online when the launch probe gets a response', async () => {
    const { result } = renderHook(() => useOnlineStatus());
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual({ isOnline: true, isSyncing: false });
  });

  it('detects being offline when the browser wrongly claims online', async () => {
    probeFails();
    const { result } = renderHook(() => useOnlineStatus());
    await flush();
    expect(result.current).toEqual({ isOnline: false, isSyncing: false });
  });

  it('treats a probe timeout as inconclusive, not offline', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation(
      (_url, init) =>
        new Promise((_, reject) =>
          init!.signal!.addEventListener('abort', () => reject(new DOMException('', 'AbortError'))),
        ),
    );
    const { result } = renderHook(() => useOnlineStatus());
    await act(async () => vi.advanceTimersByTime(8_000));
    expect(result.current.isOnline).toBe(true);
  });

  it('re-probes while offline and recovers without an online event', async () => {
    vi.useFakeTimers();
    probeFails();
    const sync = deferSync();
    const { result } = renderHook(() => useOnlineStatus());
    await flush();
    expect(result.current.isOnline).toBe(false);

    probeSucceeds();
    await act(async () => vi.advanceTimersByTime(15_000));
    expect(result.current).toEqual({ isOnline: true, isSyncing: true });

    await sync.settle();
    expect(result.current).toEqual({ isOnline: true, isSyncing: false });
  });

  it('re-probes when the app returns to the foreground', async () => {
    const { result } = renderHook(() => useOnlineStatus());
    await flush();

    probeFails();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    await act(async () => void document.dispatchEvent(new Event('visibilitychange')));
    expect(result.current.isOnline).toBe(false);
  });

  it('stays syncing after reconnecting until queued writes reach the server', async () => {
    const sync = deferSync();
    const { result } = renderHook(() => useOnlineStatus());
    await flush();

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
    await flush();

    goOffline();
    goOnline();
    goOffline();
    goOnline();

    await stale.settle();
    expect(result.current).toEqual({ isOnline: true, isSyncing: true });

    await fresh.settle();
    expect(result.current.isSyncing).toBe(false);
  });

  it('shares one probe between components', async () => {
    renderHook(() => useOnlineStatus());
    renderHook(() => useOnlineStatus());
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('removes its listeners once the last component unmounts', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const first = renderHook(() => useOnlineStatus());
    const second = renderHook(() => useOnlineStatus());

    first.unmount();
    expect(remove).not.toHaveBeenCalledWith('online', expect.any(Function));

    second.unmount();
    expect(remove).toHaveBeenCalledWith('online', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('offline', expect.any(Function));
  });
});
