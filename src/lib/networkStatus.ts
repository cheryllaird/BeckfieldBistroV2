import { waitForServerSync } from './firestore';

// Shared online/offline state behind useOnlineStatus.
//
// The browser's own signal (navigator.onLine plus the online/offline events)
// is not enough on its own: Safari on iPhone — home-screen apps especially —
// can report "online" with the phone in aeroplane mode, and then never fires
// an event, so the app would never learn it's offline. When the browser
// claims to be online we therefore confirm it with a tiny uncached request
// (at launch, on returning to the foreground, and periodically while offline,
// since no `online` event will arrive to say a probe-detected outage is over).
// When the browser says offline we trust it: that answer is reliable.
//
// Module-level rather than per-hook so the several components reading the
// status share one set of listeners and one probe.

export interface NetworkStatus {
  isOnline: boolean;
  // True from reconnecting until the writes queued while offline have reached
  // the server, so the banner only clears once this device is up to date.
  isSyncing: boolean;
}

const PROBE_TIMEOUT_MS = 8_000;
const OFFLINE_POLL_MS = 15_000;

let status: NetworkStatus = { isOnline: true, isSyncing: false };
const listeners = new Set<() => void>();
// Bumped on every transition so a drain that settles after the connection
// drops again (or after teardown) can't clear a newer state.
let generation = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let probeInFlight: Promise<void> | null = null;

function set(next: NetworkStatus) {
  status = next;
  listeners.forEach((l) => l());
}

function goOffline() {
  if (!status.isOnline) return;
  generation++;
  set({ isOnline: false, isSyncing: false });
  startPolling();
}

function goOnline() {
  if (status.isOnline) return;
  const current = ++generation;
  stopPolling();
  set({ isOnline: true, isSyncing: true });
  waitForServerSync().then(() => {
    if (current === generation) set({ ...status, isSyncing: false });
  });
}

/**
 * Checks for a real connection with a HEAD request the service worker can't
 * answer from its cache (the query string misses the precache), so only the
 * network can. Any HTTP response means online; a network error means
 * offline. A request that gets no answer within the timeout also counts as
 * offline: iOS can leave a request hanging in aeroplane mode rather than
 * failing it, and a connection that can't fetch a favicon in 8s is unusable
 * anyway. The offline poll clears it as soon as a check succeeds.
 */
function probe(): Promise<void> {
  if (!navigator.onLine) {
    goOffline();
    return Promise.resolve();
  }
  if (probeInFlight) return probeInFlight;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  probeInFlight = fetch(`/favicon.ico?online-probe=${Date.now()}`, {
    method: 'HEAD',
    cache: 'no-store',
    signal: controller.signal,
  })
    .then(
      // The browser may have reported offline while the request was out.
      () => { if (navigator.onLine) goOnline(); },
      () => goOffline(),
    )
    .finally(() => {
      clearTimeout(timer);
      probeInFlight = null;
    });
  return probeInFlight;
}

function startPolling() {
  if (pollTimer === null) pollTimer = setInterval(probe, OFFLINE_POLL_MS);
}

function stopPolling() {
  if (pollTimer !== null) clearInterval(pollTimer);
  pollTimer = null;
}

const onVisibilityChange = () => {
  if (document.visibilityState === 'visible') probe();
};

function start() {
  generation++;
  status = { isOnline: navigator.onLine, isSyncing: false };
  window.addEventListener('online', goOnline);
  window.addEventListener('offline', goOffline);
  document.addEventListener('visibilitychange', onVisibilityChange);
  if (status.isOnline) probe();
  else startPolling();
}

function stop() {
  generation++;
  stopPolling();
  window.removeEventListener('online', goOnline);
  window.removeEventListener('offline', goOffline);
  document.removeEventListener('visibilitychange', onVisibilityChange);
}

export function subscribeNetworkStatus(listener: () => void): () => void {
  if (listeners.size === 0) start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

export function getNetworkStatus(): NetworkStatus {
  // Before anyone subscribes, report what the browser says.
  if (listeners.size === 0 && status.isOnline !== navigator.onLine) {
    status = { isOnline: navigator.onLine, isSyncing: false };
  }
  return status;
}
