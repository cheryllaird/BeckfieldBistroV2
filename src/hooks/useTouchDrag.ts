import { useEffect, useRef, type RefObject } from 'react';

/**
 * Attaches immediate-response touch drag to a grip element.
 * Uses native touch events (not pointer events) to avoid interference
 * from the draggable attribute / HTML5 DnD on mobile browsers.
 *
 * Drag starts on first touchmove (not on touchstart) so a simple tap
 * on the handle doesn't flicker the drag state.
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

      let started = false;
      const id = e.changedTouches[0].identifier;

      const handleTouchMove = (ev: TouchEvent) => {
        const touch = Array.from(ev.changedTouches).find((t) => t.identifier === id);
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

      const handleTouchEndOrCancel = (ev: TouchEvent) => {
        if (!Array.from(ev.changedTouches).find((t) => t.identifier === id)) return;
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEndOrCancel);
        document.removeEventListener('touchcancel', handleTouchEndOrCancel);
        if (started) onEndRef.current();
      };

      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEndOrCancel);
      document.addEventListener('touchcancel', handleTouchEndOrCancel);
    };

    grip.addEventListener('touchstart', handleTouchStart, { passive: false });
    return () => grip.removeEventListener('touchstart', handleTouchStart);
  }, [gripRef, enabled]);
}
