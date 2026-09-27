import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOnlineStatus } from './useOnlineStatus';

const goOnline = () => act(() => void window.dispatchEvent(new Event('online')));
const goOffline = () => act(() => void window.dispatchEvent(new Event('offline')));

describe('useOnlineStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts from navigator.onLine', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toEqual({ isOnline: false, justReconnected: false });
  });

  it('flags a reconnect for three seconds', () => {
    const { result } = renderHook(() => useOnlineStatus());

    goOffline();
    expect(result.current).toEqual({ isOnline: false, justReconnected: false });

    goOnline();
    expect(result.current).toEqual({ isOnline: true, justReconnected: true });

    act(() => vi.advanceTimersByTime(2_999));
    expect(result.current.justReconnected).toBe(true);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.justReconnected).toBe(false);
  });

  it('cancels the reconnect banner if the connection drops again', () => {
    const { result } = renderHook(() => useOnlineStatus());

    goOnline();
    goOffline();

    expect(result.current).toEqual({ isOnline: false, justReconnected: false });
  });

  it('removes its listeners on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useOnlineStatus());

    unmount();

    expect(remove).toHaveBeenCalledWith('online', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('offline', expect.any(Function));
  });
});
