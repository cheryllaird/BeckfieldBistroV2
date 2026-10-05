import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

beforeEach(() => {
  // Any component reading useOnlineStatus probes the network on mount (see
  // lib/networkStatus). Answer it as "online" so tests never hit the network;
  // tests that care about connectivity override this.
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null)));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
