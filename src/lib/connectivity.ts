import { ensureFirestoreOnline, flushPendingWrites, recoverIfSdkCrashed } from './firestore';

// Keeps the Firestore realtime connection alive across the lifecycle events that
// routinely put a mobile PWA to sleep.
//
// When a phone is locked or the app is backgrounded, the browser suspends the
// Firestore connection. It does not reliably re-establish on resume, which
// leaves the onSnapshot listeners silent — so changes made on another device
// (e.g. a shopping-list item checked off on a partner's phone) never arrive
// until a full reload. Forcing enableNetwork() the moment the app returns to the
// foreground, or the device reports it's back online, wakes the listeners and
// flushes any writes that were queued while dormant.
//
// enableNetwork() is idempotent, so calling it on every wake event is safe.

let started = false;

export function startConnectivityManager(): () => void {
  if (started || typeof window === 'undefined') return () => {};
  started = true;

  // Becoming visible again: wake the connection so listeners resume.
  // Becoming hidden: the app is being backgrounded or closed — drain any
  // queued writes to the server now, while the page is still alive, so a change
  // just made on this device reaches other devices without waiting for the next
  // launch. Best-effort: the browser may kill the page first, in which case the
  // durable IndexedDB queue replays on relaunch (see flushPendingWrites).
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') ensureFirestoreOnline();
    else flushPendingWrites();
  };
  const wakeIfVisible = () => {
    if (document.visibilityState === 'visible') ensureFirestoreOnline();
  };

  // Fatal Firestore SDK crashes ("INTERNAL ASSERTION FAILED") are thrown from
  // the SDK's internal scheduler, so they surface as uncaught errors or
  // unhandled rejections rather than through any of our own catch handlers.
  // Detect them here and restart the app (see recoverIfSdkCrashed) — without
  // this, sync stays silently dead until the user force-closes the app.
  const onWindowError = (e: ErrorEvent) => recoverIfSdkCrashed(e.error ?? e.message);
  const onUnhandledRejection = (e: PromiseRejectionEvent) => recoverIfSdkCrashed(e.reason);

  window.addEventListener('online', ensureFirestoreOnline);
  window.addEventListener('focus', wakeIfVisible);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('error', onWindowError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
  // pagehide is the most reliable "app is going away" signal on mobile Safari,
  // where it can fire without a preceding visibilitychange when the PWA is
  // swiped away.
  window.addEventListener('pagehide', flushPendingWrites);

  // Kick once on startup in case the SDK initialised while the connection was
  // dormant (cold launch from a locked phone).
  ensureFirestoreOnline();

  return () => {
    window.removeEventListener('online', ensureFirestoreOnline);
    window.removeEventListener('focus', wakeIfVisible);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('error', onWindowError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
    window.removeEventListener('pagehide', flushPendingWrites);
    started = false;
  };
}
