import { idbStorage } from './idbStorage';
import type { AppState } from '../types';

// Per-bistro offline cache. The persisted Zustand store only holds the bistro
// being viewed; when the user switches away, that bistro's collections are
// parked here so switching back is instant and works offline, rather than
// wiping and re-downloading every recipe image.
//
// Keys include the signed-in uid so one account on a shared device can never
// load another account's parked copy.

export type ScopeData = Pick<
  AppState,
  'recipes' | 'mealEntries' | 'shoppingItems' | 'shoppingTombstones' | 'pantryItems' | 'knownSources'
>;

export const EMPTY_SCOPE: ScopeData = {
  recipes: [],
  mealEntries: [],
  shoppingItems: [],
  shoppingTombstones: {},
  pantryItems: [],
  knownSources: [],
};

const key = (uid: string, bistroId: string) => `bistro-cache:${uid}:${bistroId}`;

export function pickScopeData(s: ScopeData): ScopeData {
  return {
    recipes: s.recipes,
    mealEntries: s.mealEntries,
    shoppingItems: s.shoppingItems,
    shoppingTombstones: s.shoppingTombstones,
    pantryItems: s.pantryItems,
    knownSources: s.knownSources,
  };
}

export async function saveScopeCache(uid: string, bistroId: string, data: ScopeData): Promise<void> {
  await idbStorage.setItem(key(uid, bistroId), JSON.stringify(data));
}

export async function loadScopeCache(uid: string, bistroId: string): Promise<ScopeData> {
  try {
    const raw = await idbStorage.getItem(key(uid, bistroId));
    return raw ? { ...EMPTY_SCOPE, ...(JSON.parse(raw as string) as Partial<ScopeData>) } : EMPTY_SCOPE;
  } catch {
    return EMPTY_SCOPE;
  }
}

export async function clearScopeCache(uid: string, bistroId: string): Promise<void> {
  await idbStorage.removeItem(key(uid, bistroId));
}
