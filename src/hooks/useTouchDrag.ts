import { useEffect, useRef, type RefObject } from 'react';

/**
 * Immediate-response touch drag for a grip handle element.
 *
 * Key design decisions:
 * - Calls stopPropagation on touchstart so the draggable parent never sees
 *   the touch, preventing its DnD long-press timer from starting (which
 *   would otherwise fire touchcancel and swallow subsequent touch events).
 * - Attaches touchmove/touchend/touchcancel directly to the grip DOM node.
 *   Touch events are always dispatched to the element that received
 *   touchstart, so these listeners fire reliably regardless of where the
 *   finger moves, and regardless of what the parent draggable div does.
 * - Window fallback for touchend/touchcancel as a safety net.
 * - Drag starts on first touchmove (not touchstart) to avoid flickering
 *   the drag state on a simple tap.
 */
export function useTouchDrag({
  gripRef,
  enabled,
  onStart,
  onMoveOver,
  onEnd,
}: {
  gripRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  onStart: () => void;
  onMoveOver: (idx: number) => void;
  onEnd: () => void;
}) {
  const onStartRef = useRef(onStart);
  const onMoveOverRef = useRef(onMoveOver);
  const onEndRef = useRef(onEnd);
  onStartRef.current = onStart;
  onMoveOverRef.current = onMoveOver;
  onEndRef.current = onEnd;

  useEffect(() => {
    const grip = gripRef.current;
    if (!grip || !enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      e.stopPropagation(); // prevent draggable parent from seeing this touch

      let started = false;
      let ended = false;

      const finish = () => {
        if (ended) return;
        ended = true;
        grip.removeEventListener('touchmove', handleTouchMove);
        grip.removeEventListener('touchend', finish);
        grip.removeEventListener('touchcancel', finish);
        window.removeEventListener('touchend', finish);
        window.removeEventListener('touchcancel', finish);
        if (started) onEndRef.current();
      };

      const handleTouchMove = (ev: TouchEvent) => {
        const touch = ev.changedTouches[0] ?? ev.touches[0];
        if (!touch) return;
        ev.preventDefault();
        if (!started) {
          started = true;
          onStartRef.current();
        }
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        const row = (el as Element | null)?.closest('[data-drag-index]') as HTMLElement | null;
        if (row) {
          const idx = parseInt(row.dataset.dragIndex ?? '-1', 10);
          if (idx >= 0) onMoveOverRef.current(idx);
        }
      };

      // Primary: grip element (always fires since touch target = touchstart target)
      grip.addEventListener('touchmove', handleTouchMove, { passive: false });
      grip.addEventListener('touchend', finish);
      grip.addEventListener('touchcancel', finish);
      // Fallback: window, in case something stops propagation on the way up
      window.addEventListener('touchend', finish);
      window.addEventListener('touchcancel', finish);
    };

    grip.addEventListener('touchstart', handleTouchStart, { passive: false });
    return () => grip.removeEventListener('touchstart', handleTouchStart);
  }, [gripRef, enabled]);
}
