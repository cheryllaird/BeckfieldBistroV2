export type CaptureMode = 'url' | 'upload' | 'manual';

const MODES: readonly CaptureMode[] = ['url', 'upload', 'manual'];

interface InitialModeInput {
  /** The `?mode=` search param, as given (untrusted). */
  modeParam: string | null;
  /** Opened from the planner with `?title=`, or editing an existing recipe. */
  forceManual: boolean;
  isOnline: boolean;
}

/**
 * Which tab New Recipe opens on. Editing or a planner prefill always opens Manual.
 * A known `?mode=` is honoured, except that URL and Photo need a connection, so
 * offline they fall back to Manual. Anything else opens Photo, as before.
 */
export function initialCaptureMode({ modeParam, forceManual, isOnline }: InitialModeInput): CaptureMode {
  if (forceManual) return 'manual';
  const requested = MODES.find((m) => m === modeParam);
  if (!requested) return 'upload';
  if (requested !== 'manual' && !isOnline) return 'manual';
  return requested;
}
