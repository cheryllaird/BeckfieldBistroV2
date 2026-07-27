import { useRef, type RefObject } from 'react';

/**
 * Shared horizontal swipe-to-navigate gesture.
 *
 * Every swipeable surface in the app (shopping lists, meal-plan week,
 * meal-plan history calendar, recipe detail tabs) uses this hook, so the
 * feel is identical everywhere: the content follows the finger, resists at
 * the ends of the range, and slides out / in over the same 200ms.
 *
 * The caller renders two nested elements:
 *   - an outer wrapper carrying the returned handlers and `overflow-hidden`,
 *     sized to the full swipeable area;
 *   - an inner element (contentRef) that is the thing actually translated.
 *
 * Vertical disambiguation: the first 8px of movement locks the gesture to
 * either scroll or swipe, so this never fights page scroll or row drag.
 */

/** Duration of the slide-out / slide-in halves of the transition. */
export const SWIPE_SLIDE_MS = 200;
/** Movement needed before the gesture commits to scroll-vs-swipe. */
const DIRECTION_LOCK_PX = 8;
/** Horizontal distance needed to actually change page. */
const SWIPE_THRESHOLD_PX = 80;
/** Fraction of the drag applied when there is nothing to swipe to. */
const EDGE_RESISTANCE = 0.25;
const SLIDE_TRANSITION = `transform ${SWIPE_SLIDE_MS}ms ease-out`;

interface UseSwipeNavigateOptions {
  /** The element that slides. Must sit inside an `overflow-hidden` wrapper. */
  contentRef: RefObject<HTMLElement | null>;
  onNext: () => void;
  onPrev: () => void;
  /** False at the end of the range — the drag is damped and won't commit. */
  canGoNext?: boolean;
  canGoPrev?: boolean;
  /** Set false to disable the gesture entirely (handlers become no-ops). */
  enabled?: boolean;
}

export interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchCancel: () => void;
}

export function useSwipeNavigate({
  contentRef,
  onNext,
  onPrev,
  canGoNext = true,
  canGoPrev = true,
  enabled = true,
}: UseSwipeNavigateOptions): SwipeHandlers {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const isScrollGesture = useRef<boolean | null>(null);

  const reset = () => {
    startX.current = null;
    startY.current = null;
    isScrollGesture.current = null;
  };

  const snapBack = () => {
    const el = contentRef.current;
    if (!el) return;
    el.style.transition = SLIDE_TRANSITION;
    el.style.transform = 'translateX(0)';
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (!enabled) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isScrollGesture.current = null;
    if (contentRef.current) contentRef.current.style.transition = 'none';
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!enabled) return;
    const el = contentRef.current;
    if (startX.current === null || startY.current === null || !el) return;

    const deltaX = e.touches[0].clientX - startX.current;
    const deltaY = e.touches[0].clientY - startY.current;

    if (
      isScrollGesture.current === null &&
      (Math.abs(deltaX) > DIRECTION_LOCK_PX || Math.abs(deltaY) > DIRECTION_LOCK_PX)
    ) {
      isScrollGesture.current = Math.abs(deltaY) > Math.abs(deltaX);
    }
    if (isScrollGesture.current) return;

    const hasNeighbour = deltaX < 0 ? canGoNext : canGoPrev;
    el.style.transform = `translateX(${hasNeighbour ? deltaX : deltaX * EDGE_RESISTANCE}px)`;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!enabled) return;
    const el = contentRef.current;
    if (startX.current === null || !el) return;

    const delta = e.changedTouches[0].clientX - startX.current;
    const wasScroll = isScrollGesture.current;
    reset();

    const goNext = delta < 0;
    const canSwipe =
      !wasScroll &&
      Math.abs(delta) > SWIPE_THRESHOLD_PX &&
      (goNext ? canGoNext : canGoPrev);

    if (!canSwipe) {
      snapBack();
      return;
    }

    // Slide the current page out, switch, then slide the new page in from
    // the opposite edge.
    const width = el.offsetWidth;
    el.style.transition = SLIDE_TRANSITION;
    el.style.transform = `translateX(${goNext ? -width : width}px)`;

    setTimeout(() => {
      if (goNext) onNext();
      else onPrev();
      const current = contentRef.current;
      if (!current) return;
      current.style.transition = 'none';
      current.style.transform = `translateX(${goNext ? width : -width}px)`;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const settled = contentRef.current;
          if (!settled) return;
          settled.style.transition = SLIDE_TRANSITION;
          settled.style.transform = 'translateX(0)';
        });
      });
    }, SWIPE_SLIDE_MS);
  };

  const onTouchCancel = () => {
    if (!enabled) return;
    if (startX.current === null) return;
    reset();
    snapBack();
  };

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel };
}
