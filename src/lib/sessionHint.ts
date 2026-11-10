// A tiny synchronous "this device was signed in last time" flag.
//
// The persisted store lives in IndexedDB, which can only be read
// asynchronously, so on a refresh the app can't know whether it's about to
// show the library or the sign-in screen until hydration finishes. Without a
// hint it had to show the full-screen splash for that gap, which flashed
// between views on every refresh. localStorage is synchronous, so this flag
// lets a returning user see the app shell with a loading state instead.
//
// It only chooses which loading screen to show; nothing trusts it for auth.

const KEY = 'bistro-session-hint';

export function hadSession(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setSessionHint(signedIn: boolean): void {
  try {
    if (signedIn) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked (private mode, quota): fall back to the splash.
  }
}
