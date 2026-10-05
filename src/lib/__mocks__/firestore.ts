import { vi } from 'vitest';

// Stand-in for lib/firestore, picked up by `vi.mock('.../lib/firestore')`.
// Every export the store uses is a spy, so tests can assert what would have
// been written without touching Firebase.
export const subscribeToUserData = vi.fn(() => () => {});
export const subscribeToIncomingShares = vi.fn(() => () => {});
export const saveRecipe = vi.fn(async () => {});
export const deleteRecipeDoc = vi.fn();
export const saveMealEntry = vi.fn();
export const deleteMealEntryDoc = vi.fn();
export const patchShoppingItems = vi.fn();
export const deleteShoppingItemDoc = vi.fn();
export const savePantryItem = vi.fn();
export const savePantryItems = vi.fn();
export const deletePantryItemDoc = vi.fn();
export const saveKnownSources = vi.fn();
export const saveDefaultBistro = vi.fn();
export const saveGeminiApiKey = vi.fn(async () => {});
export const sendRecipeShare = vi.fn(async () => {});
export const acceptShare = vi.fn(async () => {});
export const dismissShare = vi.fn(async () => {});
export const logCategoryOverride = vi.fn();
export const saveCategoryOverride = vi.fn();
export const deleteCategoryOverride = vi.fn();
export const recoverIfSdkCrashed = vi.fn();
export const ensureFirestoreOnline = vi.fn(async () => {});
export const flushPendingWrites = vi.fn(async () => {});
export const waitForServerSync = vi.fn(async () => {});
export const setDataRoot = vi.fn();
export const subscribeToBistroAccess = vi.fn(() => () => {});
export const subscribeToBistro = vi.fn(() => () => {});
