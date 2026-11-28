import { useEffect, useRef, useState } from 'react';

/** Scrolled less than this from the top: always shown. */
const SHOW_NEAR_TOP_PX = 120;
/** Downward movement needed (in one go) before hiding, so small jitters don't flicker it. */
const HIDE_AFTER_PX = 48;
/** Pages that can scroll less than this never hide anything. */
const MIN_SCROLLABLE_PX = 200;

/**
 * Returns true while a bar should be hidden: after the user scrolls down, and false again
 * on any scroll up. Listens to the window, which is what scrolls in AppLayout.
 * While `locked` is true (e.g. the search box has focus) the bar always shows.
 */
export function useHideOnScroll(locked = false): boolean {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const downFrom = useRef<number | null>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (locked) return;
    lastY.current = Math.max(0, window.scrollY);
    downFrom.current = null;

    const update = () => {
      frame.current = null;
      const y = Math.max(0, window.scrollY); // iOS rubber-band can go negative
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const prev = lastY.current;
      lastY.current = y;

      if (y < SHOW_NEAR_TOP_PX || scrollable < MIN_SCROLLABLE_PX) {
        downFrom.current = null;
        setHidden(false);
        return;
      }
      if (y < prev) {
        downFrom.current = null;
        setHidden(false);
        return;
      }
      if (y > prev) {
        // Count downward travel from where it started, but never from above the show-near-top zone.
        downFrom.current ??= Math.max(prev, SHOW_NEAR_TOP_PX);
        if (y - downFrom.current >= HIDE_AFTER_PX) setHidden(true);
      }
    };

    const onScroll = () => {
      if (frame.current === null) frame.current = window.requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [locked]);

  return hidden && !locked;
}
