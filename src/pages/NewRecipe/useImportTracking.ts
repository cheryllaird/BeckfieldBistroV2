import { useCallback, useEffect, useRef } from 'react';
import { track, type ImportMethod } from '../../lib/usage';

/**
 * Anonymous import funnel counts for New Recipe (ADR 0019). An import starts
 * with its method's first action (Extract tapped, a photo confirmed, or the
 * manual form opened without an extraction). Starting a different method
 * abandons the current import, so per method started = saved + abandoned,
 * apart from events dropped offline and the app being closed mid-import
 * (which unmounts nothing and so counts only as started).
 *
 * `enabled` is false when editing an existing recipe: that isn't an import.
 */
export function useImportTracking(enabled: boolean, startManual: boolean) {
  const current = useRef<ImportMethod | null>(null);

  const begin = useCallback(
    (method: ImportMethod) => {
      if (!enabled || current.current === method) return;
      if (current.current) void track({ event: 'import_abandoned', value: current.current });
      current.current = method;
      void track({ event: 'import_started', value: method });
    },
    [enabled],
  );

  /** The import was saved as `method` (the recipe's importMeta.method). */
  const saved = useCallback(
    (method: ImportMethod) => {
      if (!enabled) return;
      begin(method);
      current.current = null;
      void track({ event: 'import_saved', value: method });
    },
    [enabled, begin],
  );

  useEffect(() => {
    if (startManual) begin('manual');
    return () => {
      if (current.current) void track({ event: 'import_abandoned', value: current.current });
      current.current = null;
    };
  }, [begin, startManual]);

  return { begin, saved };
}
