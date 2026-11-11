import { auth } from './firebase';
import { authedFetch } from './apiClient';
import { getNetworkStatus } from './networkStatus';

// Anonymous usage counters (ADR 0019). Each call sends one allow-listed event
// and value to /api/track, which adds one to an aggregate counter. Nothing
// identifies the user in the body, and nothing is stored on the device: an
// event that can't be sent right now (offline, signed out, a failed request)
// is dropped, never queued. Development and test builds send nothing.
//
// Keep these unions in step with TRACK_EVENTS in api/_utils/trackRules.ts.

export type ImportMethod = 'url' | 'photo' | 'manual';
export type PantrySkipBucket = '0' | '1' | '2-3' | '4-6' | '7+';
export type DisplayMode = 'standalone' | 'browser';

export type UsageEvent =
  | { event: 'import_started' | 'import_saved' | 'import_abandoned'; value: ImportMethod }
  | { event: 'pantry_skip'; value: PantrySkipBucket }
  | { event: 'display_mode'; value: DisplayMode };

/** Fire and forget: resolves once sent or dropped, and never rejects. */
export async function track({ event, value }: UsageEvent): Promise<void> {
  try {
    if (!import.meta.env.PROD) return;
    const user = auth?.currentUser;
    if (!user) return;
    if (!getNetworkStatus().isOnline) return;
    await authedFetch(user, '/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, value }),
      keepalive: true,
    });
  } catch {
    // Counters are best-effort; a failure must never reach the user.
  }
}

/** The bucket for how many items the store cupboard kept off a generated list. */
export function pantrySkipBucket(n: number): PantrySkipBucket {
  if (n <= 0) return '0';
  if (n === 1) return '1';
  if (n <= 3) return '2-3';
  if (n <= 6) return '4-6';
  return '7+';
}

/** Whether the app runs installed (home screen) or in a browser tab. */
export function currentDisplayMode(): DisplayMode {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const standalone = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  return iosStandalone || standalone ? 'standalone' : 'browser';
}

let displayModeSent = false;

/** Counts the display mode once per app session (page load), after sign-in. */
export function trackDisplayModeOnce(): void {
  if (displayModeSent) return;
  displayModeSent = true;
  void track({ event: 'display_mode', value: currentDisplayMode() });
}

