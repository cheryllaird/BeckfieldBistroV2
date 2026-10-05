import { useSyncExternalStore } from 'react';
import { getNetworkStatus, subscribeNetworkStatus } from '../lib/networkStatus';

export function useOnlineStatus() {
  return useSyncExternalStore(subscribeNetworkStatus, getNetworkStatus);
}
