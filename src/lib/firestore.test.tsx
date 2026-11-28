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
const firebaseAuth = vi.hoisted(() => ({ currentUser: null as null | { uid: string } }));
vi.mock('./firebase', () => ({ db: {}, auth: firebaseAuth }));
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

describe('writes after the SDK has crashed', () => {
  // Once the SDK's async queue has failed, write calls throw synchronously
  // instead of rejecting. Those throws must neither escape to the caller (the
  // Plan-a-meal modal stayed open and a second tap added a duplicate) nor
  // bypass the crash recovery.
  const crash = () => {
    throw new Error('FIRESTORE (12.0.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: 47125)');
  };
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const sdk = await import('firebase/firestore');
    vi.mocked(sdk.setDoc).mockImplementation(crash);
    vi.mocked(sdk.deleteDoc).mockImplementation(crash);
    vi.mocked(sdk.addDoc).mockImplementation(crash);
    vi.mocked(sdk.writeBatch).mockImplementation(
      () => ({ set: vi.fn(), commit: crash }) as never,
    );
    reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    sessionStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    const sdk = await import('firebase/firestore');
    vi.mocked(sdk.setDoc).mockImplementation(async () => {});
    vi.mocked(sdk.deleteDoc).mockImplementation(async () => {});
    vi.mocked(sdk.addDoc).mockImplementation(async () => ({}) as never);
    vi.mocked(sdk.writeBatch).mockImplementation(
      () => ({ set: vi.fn(), commit: vi.fn(async () => {}) }) as never,
    );
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('saveMealEntry does not throw and triggers the crash recovery reload', async () => {
    const fs = await load();
    expect(() => fs.saveMealEntry('b', { id: 'm1' } as never)).not.toThrow();
    vi.advanceTimersByTime(1_000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('no fire-and-forget writer lets a synchronous throw escape', async () => {
    const fs = await load();
    const writes: Array<() => void> = [
      () => fs.saveMealEntry('b', { id: 'm1' } as never),
      () => fs.deleteMealEntryDoc('b', 'm1'),
      () => fs.deleteRecipeDoc('b', 'r1'),
      () => fs.patchShoppingItems('b', [{ id: 's1', checked: true } as never]),
      () => fs.deleteShoppingItemDoc('b', 's1'),
      () => fs.savePantryItem('b', { id: 'p1' } as never),
      () => fs.deletePantryItemDoc('b', 'p1'),
      () => fs.savePantryItems('b', [{ id: 'p1' } as never]),
      () => fs.saveCategoryOverride('b', { ingredientKey: 'salt' } as never),
      () => fs.deleteCategoryOverride('b', 'salt'),
      () => fs.logCategoryOverride('b', { ingredientKey: 'salt' } as never),
      () => fs.saveKnownSources('b', ['Book']),
      () => fs.saveTermsAcceptance('u', '1'),
      () => fs.saveDefaultBistro('u', 'b'),
    ];
    for (const write of writes) expect(write).not.toThrow();
  });
});

describe('unsent writes after a crash (#242)', () => {
  const crash = () => {
    throw new Error('FIRESTORE (12.0.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: 47125)');
  };
  const meal = { id: 'm1', date: '2026-11-21', type: 'custom', servings: 2 } as never;
  const pantry = { id: 'p1', name: 'Rice' } as never;

  beforeEach(() => {
    firebaseAuth.currentUser = { uid: 'me' };
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('location', { ...window.location, reload: vi.fn() });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    const sdk = await import('firebase/firestore');
    vi.mocked(sdk.setDoc).mockImplementation(async () => {});
    vi.mocked(sdk.deleteDoc).mockImplementation(async () => {});
    vi.mocked(sdk.writeBatch).mockImplementation(
      () => ({ set: vi.fn(), commit: vi.fn(async () => {}) }) as never,
    );
    firebaseAuth.currentUser = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function crashSdk() {
    const sdk = await import('firebase/firestore');
    vi.mocked(sdk.setDoc).mockImplementation(crash);
    vi.mocked(sdk.deleteDoc).mockImplementation(crash);
    vi.mocked(sdk.writeBatch).mockImplementation(() => ({ set: vi.fn(), commit: crash }) as never);
    return sdk;
  }

  it('records meal and pantry writes the crashed SDK refused', async () => {
    await crashSdk();
    const fs = await load();
    const { readUnsentWrites } = await import('./unsentWrites');

    fs.saveMealEntry('b', meal);
    fs.deleteMealEntryDoc('b', 'm2');
    fs.savePantryItem('b', pantry);
    fs.deletePantryItemDoc('b', 'p2');

    expect(readUnsentWrites()).toEqual([
      expect.objectContaining({ uid: 'me', bistroId: 'b', collection: 'mealEntries', id: 'm1', kind: 'set', data: meal }),
      expect.objectContaining({ collection: 'mealEntries', id: 'm2', kind: 'delete' }),
      expect.objectContaining({ collection: 'pantryItems', id: 'p1', kind: 'set', data: pantry }),
      expect.objectContaining({ collection: 'pantryItems', id: 'p2', kind: 'delete' }),
    ]);
  });

  it('records each item of a refused pantry reorder with its new order', async () => {
    await crashSdk();
    const fs = await load();
    const { readUnsentWrites } = await import('./unsentWrites');

    fs.savePantryItems('b', [{ id: 'p1' } as never, { id: 'p2' } as never]);

    expect(readUnsentWrites().map((r) => (r.kind === 'set' ? r.data : null))).toEqual([
      { id: 'p1', order: 0 },
      { id: 'p2', order: 1 },
    ]);
  });

  it('records nothing for writes that reached the offline queue', async () => {
    const fs = await load();
    const { readUnsentWrites } = await import('./unsentWrites');
    fs.saveMealEntry('b', meal);
    fs.deleteMealEntryDoc('b', 'm2');
    await vi.runAllTimersAsync();
    expect(readUnsentWrites()).toEqual([]);
  });

  it('replays only this user\'s writes to this bistro, then forgets them once acknowledged', async () => {
    const sdk = await import('firebase/firestore');
    const fs = await load();
    const { recordUnsentWrite, readUnsentWrites } = await import('./unsentWrites');
    recordUnsentWrite({ uid: 'me', bistroId: 'b', collection: 'mealEntries', id: 'm1', kind: 'set', data: meal });
    recordUnsentWrite({ uid: 'me', bistroId: 'b', collection: 'mealEntries', id: 'm2', kind: 'delete' });
    recordUnsentWrite({ uid: 'me', bistroId: 'other', collection: 'mealEntries', id: 'm3', kind: 'delete' });
    recordUnsentWrite({ uid: 'someone-else', bistroId: 'b', collection: 'mealEntries', id: 'm4', kind: 'delete' });
    vi.mocked(sdk.setDoc).mockClear();
    vi.mocked(sdk.deleteDoc).mockClear();

    fs.replayUnsentWrites('b', 'me');

    expect(sdk.setDoc).toHaveBeenCalledTimes(1);
    expect(sdk.setDoc).toHaveBeenCalledWith(expect.anything(), meal);
    expect(sdk.deleteDoc).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    expect(readUnsentWrites().map((r) => r.id)).toEqual(['m3', 'm4']);
  });

  it('keeps a record while the SDK is still crashed, and forgets one the server rejects', async () => {
    const sdk = await crashSdk();
    const fs = await load();
    const { recordUnsentWrite, readUnsentWrites } = await import('./unsentWrites');
    recordUnsentWrite({ uid: 'me', bistroId: 'b', collection: 'mealEntries', id: 'm1', kind: 'set', data: meal });

    fs.replayUnsentWrites('b', 'me');
    await vi.runAllTimersAsync();
    expect(readUnsentWrites()).toHaveLength(1);

    vi.mocked(sdk.setDoc).mockImplementation(async () => {
      throw new Error('permission-denied');
    });
    fs.replayUnsentWrites('b', 'me');
    await vi.runAllTimersAsync();
    expect(readUnsentWrites()).toEqual([]);
  });
});
