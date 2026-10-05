import { useState, useEffect } from 'react';
import { waitForServerSync } from '../lib/firestore';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  // True from reconnecting until the writes queued while offline have reached
  // the server, so the banner only clears once this device is up to date.
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    // Bumped on every transition so a drain that settles after the connection
    // drops again (or after unmount) can't clear a newer state.
    let generation = 0;

    const handleOnline = () => {
      const current = ++generation;
      setIsOnline(true);
      setIsSyncing(true);
      waitForServerSync().then(() => {
        if (current === generation) setIsSyncing(false);
      });
    };

    const handleOffline = () => {
      generation++;
      setIsOnline(false);
      setIsSyncing(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      generation++;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, isSyncing };
}
