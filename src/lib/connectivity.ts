import { ensureFirestoreOnline } from './firestore';

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

  const wakeIfVisible = () => {
    if (document.visibilityState === 'visible') ensureFirestoreOnline();
  };

  window.addEventListener('online', ensureFirestoreOnline);
  window.addEventListener('focus', wakeIfVisible);
  document.addEventListener('visibilitychange', wakeIfVisible);

  // Kick once on startup in case the SDK initialised while the connection was
  // dormant (cold launch from a locked phone).
  ensureFirestoreOnline();

  return () => {
    window.removeEventListener('online', ensureFirestoreOnline);
    window.removeEventListener('focus', wakeIfVisible);
    document.removeEventListener('visibilitychange', wakeIfVisible);
    started = false;
  };
}
