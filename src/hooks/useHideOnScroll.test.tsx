import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHideOnScroll } from './useHideOnScroll';

let pageHeight = 3000;
let frames: FrameRequestCallback[] = [];

// Scroll, then run the queued animation frame, as the browser would before the next paint.
function scrollTo(y: number) {
  act(() => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
    window.dispatchEvent(new Event('scroll'));
    const queued = frames;
    frames = [];
    queued.forEach((cb) => cb(0));
  });
}

beforeEach(() => {
  pageHeight = 3000;
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, get: () => pageHeight });
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  frames = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb));
});

afterEach(() => vi.restoreAllMocks());

describe('useHideOnScroll', () => {
  it('starts shown', () => {
    const { result } = renderHook(() => useHideOnScroll());
    expect(result.current).toBe(false);
  });

  it('hides after scrolling down past the threshold and shows again on any scroll up', () => {
    const { result } = renderHook(() => useHideOnScroll());
    scrollTo(150);
    scrollTo(160);
    expect(result.current).toBe(false); // only 40px of travel past the near-top zone
    scrollTo(170);
    expect(result.current).toBe(true);
    scrollTo(165);
    expect(result.current).toBe(false);
  });

  it('stays shown near the top of the page', () => {
    const { result } = renderHook(() => useHideOnScroll());
    scrollTo(60);
    scrollTo(110);
    expect(result.current).toBe(false);
  });

  it('treats rubber-band (negative) scroll as the top', () => {
    const { result } = renderHook(() => useHideOnScroll());
    scrollTo(400);
    scrollTo(500);
    expect(result.current).toBe(true);
    scrollTo(-30);
    expect(result.current).toBe(false);
  });

  it('never hides on a page too short to scroll much', () => {
    pageHeight = 950;
    const { result } = renderHook(() => useHideOnScroll());
    scrollTo(130);
    scrollTo(150);
    expect(result.current).toBe(false);
  });

  it('stays shown while locked, even after scrolling down', () => {
    const { result, rerender } = renderHook(({ locked }) => useHideOnScroll(locked), {
      initialProps: { locked: false },
    });
    scrollTo(400);
    scrollTo(500);
    expect(result.current).toBe(true);

    rerender({ locked: true });
    expect(result.current).toBe(false);
    scrollTo(700);
    expect(result.current).toBe(false);
  });
});
