import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRecipe } from '../test/factories';
import type { Bistro } from '../types';
import type { BistroAccess } from '../lib/firestore';

vi.mock('../lib/firestore');
vi.mock('../lib/idbStorage');
vi.mock('../lib/bistro', () => ({
  fetchIncomingInvites: vi.fn(async () => []),
  acceptInvite: vi.fn(async () => 'ann'),
  declineInvite: vi.fn(async () => ({ ok: true })),
  renameBistro: vi.fn(async () => ({ ok: true })),
  inviteMember: vi.fn(async () => ({ id: 'inv-1' })),
  revokeInvite: vi.fn(async () => ({ ok: true })),
  removeMember: vi.fn(async () => ({ ok: true })),
  leaveBistro: vi.fn(async () => ({ ok: true })),
  migrateBistroStep: vi.fn(async () => ({ done: true, copied: 0 })),
  syncLegacyStep: vi.fn(async () => ({ done: true, copied: 0, removed: 0 })),
  placeholderBistro: (u: { uid: string; name: string }) => ({
    id: u.uid,
    name: `${u.name}'s Bistro`,
    ownerUid: u.uid,
    createdAt: '',
    memberUids: [u.uid],
    members: {},
  }),
}));

const firestore = await import('../lib/firestore');
const { idbStorage } = await import('../lib/idbStorage');
const api = await import('../lib/bistro');
const { useStore } = await import('./index');

const initialState = useStore.getState();
const ME = { uid: 'me', name: 'Cheryl', email: 'cheryl@example.com' };

const annsBistro: Bistro = {
  id: 'ann',
  name: "Ann's Bistro",
  ownerUid: 'ann',
  createdAt: '2026-01-01',
  memberUids: ['ann', 'me'],
  members: {},
};

// Captured listener callbacks, so tests can play the server's part.
let emitAccess: (access: BistroAccess | null) => void;
const bistroListeners = new Map<string, { cb: (b: Bistro | null) => void; onError: (e: Error) => void }>();

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Signs in with persisted state and attaches listeners, as a relaunch does. */
function launch(state: Partial<ReturnType<typeof useStore.getState>> = {}) {
  useStore.setState({ user: ME, isAuthenticated: true, bistroMigrated: true, ...state });
  useStore.getState().resubscribe();
}

beforeEach(() => {
  useStore.setState(initialState, true);
  vi.clearAllMocks();
  bistroListeners.clear();
  vi.mocked(firestore.subscribeToBistroAccess).mockImplementation((_uid, cb) => {
    emitAccess = cb;
    return () => {};
  });
  vi.mocked(firestore.subscribeToBistro).mockImplementation((id, cb, onError) => {
    bistroListeners.set(id, { cb, onError });
    return () => bistroListeners.delete(id);
  });
});

afterEach(async () => {
  await useStore.getState().signOut();
});

describe('scope', () => {
  it("reads and writes the user's own bistro by default", async () => {
    launch();
    expect(firestore.setDataRoot).toHaveBeenCalledWith(true);
    expect(firestore.subscribeToUserData).toHaveBeenCalledWith('me', 'me', expect.anything());

    await useStore.getState().addRecipe(makeRecipe({ id: 'r1' }));
    expect(firestore.saveRecipe).toHaveBeenCalledWith('me', expect.objectContaining({ userId: 'me' }));
  });

  it('writes into the active bistro but stamps recipes with who added them', async () => {
    launch({ activeBistroId: 'ann' });
    expect(firestore.subscribeToUserData).toHaveBeenCalledWith('ann', 'me', expect.anything());

    await useStore.getState().addRecipe(makeRecipe({ id: 'r1' }));
    expect(firestore.saveRecipe).toHaveBeenCalledWith('ann', expect.objectContaining({ userId: 'me' }));

    useStore.getState().toggleShoppingItem('nope');
    useStore.getState().rememberCategory({
      itemName: 'rice noodles',
      ingredientKey: 'rice noodle',
      fromCategory: 'Pantry',
      toCategory: 'Other',
      source: 'shopping-list',
    });
    expect(firestore.saveCategoryOverride).toHaveBeenCalledWith('ann', expect.objectContaining({ ingredientKey: 'rice noodle', category: 'Other' }));
    expect(firestore.logCategoryOverride).toHaveBeenCalledWith('ann', expect.objectContaining({ itemName: 'rice noodles', ingredientKey: 'rice noodle' }));
  });

  it('remembers a category choice and forgets it when set back to the default', () => {
    launch();
    const change = { itemName: 'rice noodles', ingredientKey: 'rice noodle', source: 'shopping-list' as const };

    useStore.getState().rememberCategory({ ...change, fromCategory: 'Pantry', toCategory: 'Other' });
    expect(useStore.getState().categoryOverrides).toEqual({ 'rice noodle': 'Other' });

    useStore.getState().rememberCategory({ ...change, fromCategory: 'Other', toCategory: 'Pantry' });
    expect(useStore.getState().categoryOverrides).toEqual({});
    expect(firestore.deleteCategoryOverride).toHaveBeenCalledWith('me', 'rice noodle');
    expect(firestore.logCategoryOverride).toHaveBeenCalledTimes(2);
  });

  it('loads category overrides from the server', () => {
    launch();
    const callbacks = vi.mocked(firestore.subscribeToUserData).mock.calls.at(-1)![2] as unknown as {
      onCategoryOverrides: (o: { ingredientKey: string; category: string; updatedAt: number }[]) => void;
    };
    callbacks.onCategoryOverrides([{ ingredientKey: 'tofu', category: 'Dairy & Eggs', updatedAt: 1 }]);
    expect(useStore.getState().categoryOverrides).toEqual({ tofu: 'Dairy & Eggs' });
  });

  it('saves accepted recipe shares into the active bistro', async () => {
    launch({ activeBistroId: 'ann' });
    const share = {
      id: 's1',
      fromUid: 'x',
      fromName: 'X',
      toEmail: ME.email,
      createdAt: '',
      recipe: makeRecipe(),
    };
    await useStore.getState().acceptShare(share);
    expect(firestore.acceptShare).toHaveBeenCalledWith('s1', 'ann', 'me', share.recipe);
  });
});

describe('switching bistros', () => {
  it("parks the current bistro's data and loads the target's", async () => {
    launch({ recipes: [makeRecipe({ id: 'mine' })] });
    vi.mocked(firestore.subscribeToUserData).mockClear();

    await useStore.getState().switchBistro('ann');
    expect(useStore.getState().activeBistroId).toBe('ann');
    expect(useStore.getState().recipes).toEqual([]); // never visited: nothing cached
    expect(firestore.subscribeToUserData).toHaveBeenCalledWith('ann', 'me', expect.anything());

    useStore.setState({ recipes: [makeRecipe({ id: 'anns' })] });
    await useStore.getState().switchBistro('me');
    expect(useStore.getState().activeBistroId).toBeNull();
    expect(useStore.getState().recipes.map((r) => r.id)).toEqual(['mine']);

    await useStore.getState().switchBistro('ann');
    expect(useStore.getState().recipes.map((r) => r.id)).toEqual(['anns']);
  });

  it('honours switching straight back before the first switch has landed', async () => {
    launch({ recipes: [makeRecipe({ id: 'mine' })] });
    vi.mocked(firestore.subscribeToUserData).mockClear();

    const toAnn = useStore.getState().switchBistro('ann'); // still loading Ann's cache
    await useStore.getState().switchBistro('me');
    await toAnn;

    expect(useStore.getState().activeBistroId).toBeNull();
    expect(useStore.getState().recipes.map((r) => r.id)).toEqual(['mine']);
    const calls = vi.mocked(firestore.subscribeToUserData).mock.calls;
    expect(calls[calls.length - 1][0]).toBe('me');
  });

  it('ignores a repeat tap on the bistro already being switched to', async () => {
    launch();
    vi.mocked(firestore.subscribeToUserData).mockClear();

    const first = useStore.getState().switchBistro('ann');
    await useStore.getState().switchBistro('ann');
    await first;

    expect(useStore.getState().activeBistroId).toBe('ann');
    expect(firestore.subscribeToUserData).toHaveBeenCalledTimes(1);
  });

  it('is a no-op for the bistro already open, and before migration', async () => {
    launch({ bistroMigrated: false });
    vi.mocked(firestore.subscribeToUserData).mockClear();

    await useStore.getState().switchBistro('me');
    await useStore.getState().switchBistro('ann');
    expect(firestore.subscribeToUserData).not.toHaveBeenCalled();
    expect(useStore.getState().activeBistroId).toBeNull();
  });
});

describe('bistro access', () => {
  it('listens to every accessible bistro and synthesises the own one until it exists', () => {
    launch();
    emitAccess({ bistroIds: ['me', 'ann'], migrated: true });
    expect([...bistroListeners.keys()].sort()).toEqual(['ann', 'me']);

    bistroListeners.get('me')!.cb(null);
    bistroListeners.get('ann')!.cb(annsBistro);
    const { bistros } = useStore.getState();
    expect(bistros.me.name).toBe("Cheryl's Bistro");
    expect(bistros.ann.name).toBe("Ann's Bistro");
  });

  it('ignores an empty-cache snapshot', () => {
    launch();
    emitAccess(null);
    expect(bistroListeners.size).toBe(0);
  });

  it('falls back to the own bistro, with a notice, when removed from the one being viewed', async () => {
    launch({ activeBistroId: 'ann' });
    emitAccess({ bistroIds: ['me', 'ann'], migrated: true });
    bistroListeners.get('ann')!.cb(annsBistro);

    emitAccess({ bistroIds: ['me'], migrated: true });
    await flush();

    const s = useStore.getState();
    expect(s.activeBistroId).toBeNull();
    expect(s.bistros.ann).toBeUndefined();
    expect(s.removedFromBistro).toBe("Ann's Bistro");
    expect(bistroListeners.has('ann')).toBe(false);
  });

  it("doesn't keep a local copy of a bistro the user was removed from", async () => {
    launch();
    emitAccess({ bistroIds: ['me', 'ann'], migrated: true });
    bistroListeners.get('ann')!.cb(annsBistro);
    await useStore.getState().switchBistro('ann');
    useStore.setState({ recipes: [makeRecipe({ id: 'anns-secret' })] });

    emitAccess({ bistroIds: ['me'], migrated: true });
    await flush();

    expect(useStore.getState().recipes.map((r) => r.id)).not.toContain('anns-secret');
    expect(await idbStorage.getItem('bistro-cache:me:ann')).toBeNull();
  });

  it('treats permission-denied on the bistro doc as removal', async () => {
    launch({ activeBistroId: 'ann' });
    emitAccess({ bistroIds: ['me', 'ann'], migrated: true });

    bistroListeners.get('ann')!.onError(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    await flush();
    expect(useStore.getState().activeBistroId).toBeNull();
  });

  it('leaving switches home without a "removed" notice', async () => {
    launch({ activeBistroId: 'ann' });
    emitAccess({ bistroIds: ['me', 'ann'], migrated: true });
    bistroListeners.get('ann')!.cb(annsBistro);

    vi.mocked(api.leaveBistro).mockImplementationOnce(async () => {
      // The server's access update can land before the request returns.
      emitAccess({ bistroIds: ['me'], migrated: true });
      return { ok: true };
    });
    await useStore.getState().leaveBistro('ann');
    await flush();

    expect(api.leaveBistro).toHaveBeenCalledWith('ann');
    expect(useStore.getState().activeBistroId).toBeNull();
    expect(useStore.getState().removedFromBistro).toBeNull();
  });
});

describe('relaunch', () => {
  it('reopens the last bistro even if the cached access list predates joining it', async () => {
    launch({ activeBistroId: 'ann' });
    emitAccess({ bistroIds: ['me'], migrated: true, fromCache: true });
    await flush();
    expect(useStore.getState().activeBistroId).toBe('ann');
    expect(useStore.getState().removedFromBistro).toBeNull();

    emitAccess({ bistroIds: ['me', 'ann'], migrated: true });
    await flush();
    expect(useStore.getState().activeBistroId).toBe('ann');
  });

  it('opens the default bistro instead of the last one', async () => {
    launch({ defaultBistroId: 'ann', recipes: [makeRecipe({ id: 'mine' })] });
    await flush();

    expect(useStore.getState().activeBistroId).toBe('ann');
    const calls = vi.mocked(firestore.subscribeToUserData).mock.calls;
    expect(calls.map((c) => c[0])).toEqual(['ann']); // never attached to the last one first
    expect(await idbStorage.getItem('bistro-cache:me:me')).not.toBeNull(); // parked
  });

  it('applies a default learned after sign-in once, and never over a manual switch', async () => {
    let onDefault: (id: string | null) => void = () => {};
    vi.mocked(firestore.subscribeToUserData).mockImplementation((_b, _u, cbs) => {
      onDefault = cbs.onDefaultBistroId!;
      return () => {};
    });
    launch();
    onDefault('ann');
    await flush();
    expect(useStore.getState().defaultBistroId).toBe('ann');
    expect(useStore.getState().activeBistroId).toBe('ann');

    await useStore.getState().switchBistro('me');
    onDefault('ann');
    await flush();
    expect(useStore.getState().activeBistroId).toBeNull();
  });

  it('saves the default to the account, and forgets it when that bistro is lost', async () => {
    launch();
    useStore.getState().setDefaultBistro('ann');
    expect(firestore.saveDefaultBistro).toHaveBeenLastCalledWith('me', 'ann');

    emitAccess({ bistroIds: ['me'], migrated: true });
    await flush();
    expect(useStore.getState().defaultBistroId).toBeNull();
    expect(firestore.saveDefaultBistro).toHaveBeenLastCalledWith('me', null);
  });
});

describe('migration', () => {
  it('copies an unmigrated account, then flips the data root and re-attaches', async () => {
    vi.mocked(api.migrateBistroStep)
      .mockResolvedValueOnce({ done: false, copied: 5 })
      .mockResolvedValueOnce({ done: true, copied: 12 });
    launch({ bistroMigrated: false });
    expect(firestore.setDataRoot).toHaveBeenLastCalledWith(false);
    vi.mocked(firestore.subscribeToUserData).mockClear();

    emitAccess({ bistroIds: [], migrated: false });
    expect(useStore.getState().migration).toEqual({ status: 'running', copied: 0 });
    await vi.waitFor(() => expect(useStore.getState().bistroMigrated).toBe(true));

    // First round of a run restarts; later rounds resume.
    expect(vi.mocked(api.migrateBistroStep).mock.calls).toEqual([[true], [false]]);
    expect(firestore.flushPendingWrites).toHaveBeenCalled();
    expect(firestore.setDataRoot).toHaveBeenLastCalledWith(true);
    expect(firestore.subscribeToUserData).toHaveBeenCalledWith('me', 'me', expect.anything());
    expect(useStore.getState().migration).toBeNull();
  });

  it('surfaces a failure, which can be skipped to keep using the old paths', async () => {
    vi.mocked(api.migrateBistroStep).mockRejectedValueOnce(new Error('Server down'));
    launch({ bistroMigrated: false });

    emitAccess({ bistroIds: [], migrated: false });
    await vi.waitFor(() => expect(useStore.getState().migration?.status).toBe('error'));
    expect(useStore.getState().migration?.error).toBe('Server down');

    useStore.getState().skipMigration();
    expect(useStore.getState().migration).toBeNull();
    expect(useStore.getState().bistroMigrated).toBe(false);
  });

  it('adopts a migration finished on another device without copying again', () => {
    launch({ bistroMigrated: false });
    emitAccess({ bistroIds: ['me'], migrated: true });

    expect(api.migrateBistroStep).not.toHaveBeenCalled();
    expect(useStore.getState().bistroMigrated).toBe(true);
    expect(firestore.setDataRoot).toHaveBeenLastCalledWith(true);
  });
});

describe('legacy catch-up sync', () => {
  it('runs once per session for a migrated account, in the background', async () => {
    launch();
    emitAccess({ bistroIds: ['me'], migrated: true });
    emitAccess({ bistroIds: ['me', 'ann'], migrated: true });
    await flush();

    expect(api.syncLegacyStep).toHaveBeenCalledTimes(1);
  });

  it('keeps going while the server reports more to do', async () => {
    vi.mocked(api.syncLegacyStep)
      .mockResolvedValueOnce({ done: false, copied: 5, removed: 0 })
      .mockResolvedValueOnce({ done: true, copied: 2, removed: 1 });
    launch();
    emitAccess({ bistroIds: ['me'], migrated: true });

    await vi.waitFor(() => expect(api.syncLegacyStep).toHaveBeenCalledTimes(2));
  });

  it('does not run before the account has migrated', async () => {
    launch({ bistroMigrated: false });
    emitAccess({ bistroIds: [], migrated: false });
    await flush();

    expect(api.syncLegacyStep).not.toHaveBeenCalled();
  });

  it('swallows failures, leaving them for the next launch', async () => {
    vi.mocked(api.syncLegacyStep).mockRejectedValueOnce(new Error('offline'));
    launch();
    emitAccess({ bistroIds: ['me'], migrated: true });
    await flush();

    expect(useStore.getState().activeBistroId).toBeNull();
  });
});

describe('invites', () => {
  it('accepting removes the invite and returns the bistro to open', async () => {
    const invite = {
      id: 'inv-1',
      bistroId: 'ann',
      bistroName: "Ann's Bistro",
      fromUid: 'ann',
      fromName: 'Ann',
      toEmail: ME.email,
      createdAt: '',
    };
    launch({ pendingInvites: [invite] });

    await expect(useStore.getState().acceptInvite(invite)).resolves.toBe('ann');
    expect(useStore.getState().pendingInvites).toEqual([]);
  });

  it('lowercases invite emails', async () => {
    launch();
    await useStore.getState().inviteMember('me', ' Ann@Example.com ');
    expect(api.inviteMember).toHaveBeenCalledWith('me', 'ann@example.com');
  });
});

describe('sign out', () => {
  it('clears bistro state', async () => {
    launch({ activeBistroId: 'ann' });
    emitAccess({ bistroIds: ['me', 'ann'], migrated: true });
    await useStore.getState().signOut();

    const s = useStore.getState();
    expect(s.activeBistroId).toBeNull();
    expect(s.bistroMigrated).toBe(false);
    expect(s.bistros).toEqual({});
    expect(bistroListeners.size).toBe(0);
  });
});
