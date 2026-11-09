import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Real lib/firestore, fake SDK: only the wake (enableNetwork) and the write
// calls matter here.
const enableNetwork = vi.fn(async () => {});
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(async () => {}),
  deleteDoc: vi.fn(async () => {}),
  deleteField: vi.fn(),
  writeBatch: vi.fn(() => ({ set: vi.fn(), commit: vi.fn(async () => {}) })),
  addDoc: vi.fn(async () => {}),
  enableNetwork: () => enableNetwork(),
  waitForPendingWrites: vi.fn(async () => {}),
}));
vi.mock('./firebase', () => ({ db: {}, auth: null }));
vi.mock('./apiClient', () => ({ authedFetch: vi.fn() }));

const THROTTLE = 10_000;

// The throttle state is module-level, so load a fresh copy per test.
async function load() {
  vi.resetModules();
  return import('./firestore');
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  enableNetwork.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ensureFirestoreOnline', () => {
  it('wakes the connection immediately on the first change', async () => {
    const fs = await load();
    fs.saveMealEntry('b', { id: 'm1' } as never);
    expect(enableNetwork).toHaveBeenCalledTimes(1);
  });

  it('still wakes after a change made inside the throttle window', async () => {
    const fs = await load();
    fs.ensureFirestoreOnline(true); // app foregrounded
    expect(enableNetwork).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2_000);
    fs.saveMealEntry('b', { id: 'm1' } as never);
    expect(enableNetwork).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(THROTTLE - 2_000);
    expect(enableNetwork).toHaveBeenCalledTimes(2);
  });

  it('collapses a burst of changes into one trailing wake', async () => {
    const fs = await load();
    fs.saveMealEntry('b', { id: 'm1' } as never);
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(300);
      fs.saveMealEntry('b', { id: `m${i + 2}` } as never);
    }
    expect(enableNetwork).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(THROTTLE);
    expect(enableNetwork).toHaveBeenCalledTimes(2);

    // Nothing left pending once the burst has been covered.
    vi.advanceTimersByTime(THROTTLE * 3);
    expect(enableNetwork).toHaveBeenCalledTimes(2);
  });

  it('a forced wake cancels a pending trailing wake', async () => {
    const fs = await load();
    fs.ensureFirestoreOnline();
    vi.advanceTimersByTime(1_000);
    fs.ensureFirestoreOnline(); // schedules a trailing wake
    fs.ensureFirestoreOnline(true); // resume: wakes now
    expect(enableNetwork).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(THROTTLE * 2);
    expect(enableNetwork).toHaveBeenCalledTimes(2);
  });

  it('wakes the connection when accepting a shared recipe', async () => {
    const fs = await load();
    await fs.acceptShare('s1', 'b', 'me', { title: 'Soup' } as never).catch(() => {});
    expect(enableNetwork).toHaveBeenCalled();
  });
});
