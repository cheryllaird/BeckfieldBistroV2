export interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
  originalText: string;
}

export interface IngredientSection {
  title: string; // e.g. "For the dressing", or "" for the unlabeled main section
  ingredients: Ingredient[];
}

export interface Recipe {
  id: string;
  userId: string;
  title: string;
  source: string;
  sourceUrl?: string;
  coverImage?: string;
  originalImage?: string;
  servings: number;
  prepTime: string;
  totalTime: string;
  ingredients: Ingredient[]; // flat list; kept for backward compat with old recipes
  ingredientSections?: IngredientSection[]; // multi-section support for new recipes
  steps: string[];
  createdAt: string;
  updatedAt: string;
}

export type MealEntryType = 'recipe' | 'custom' | 'dining-out';
export type MealTime = 'breakfast' | 'lunch' | 'dinner' | 'side' | 'snack';

export interface MealEntry {
  id: string;
  date: string; // ISO date string e.g. "2026-03-30"
  type: MealEntryType;
  recipeId?: string;
  customTitle?: string;
  servings: number;
  location?: string; // for dining-out
  mealTime?: MealTime;
  updatedAt?: number; // epoch ms of last change; reconciles snapshots by recency
}

export interface MealSource {
  mealEntryId: string;
  recipeTitle: string;
  scaledQuantity: number;
  unit: string;
  ingredientName: string;
}

export type ShoppingListType = 'immediate' | 'stock-up';

export interface ShoppingItem {
  id: string;
  name: string; // full plain text e.g. "2 cups flour" or "chicken breast"
  category: ShoppingCategory;
  listType?: ShoppingListType; // which list this item belongs to; missing = 'immediate'
  checked: boolean;
  order?: number;
  manual?: boolean;
  mealSources?: MealSource[];
  ingredientKey?: string; // normalizeIngredientName(name) for dedup; older items may carry a "name__unit" key
  // Per-field-group sync clocks (epoch-ms hybrid logical clock — see
  // lib/shoppingSync.ts). Each group of fields carries its own clock and syncs
  // independently, so concurrent edits to different aspects of the same item
  // (rename on one device, check-off on another) merge instead of overwriting
  // each other. All optional for backward compat with docs written before the
  // fields existed; a missing clock compares as 0 (oldest).
  updatedAt?: number; // content group: name/category/listType/manual/mealSources/ingredientKey
  checkedAt?: number; // checked group
  orderAt?: number; // order group
  // Soft-delete tombstone (presence group). Deleted items keep their doc with
  // deleted: true so an offline device's queued stale write can't resurrect
  // them; the doc is only hard-deleted after TOMBSTONE_RETENTION_MS. An item is
  // hidden when the deletion is newer than its last content edit — a content
  // edit made after (unaware of) the deletion deliberately resurrects it.
  deleted?: boolean;
  deletedAt?: number;
}

export type ShoppingCategory =
  | 'Vegetables'
  | 'Fruit'
  | 'Herbs & Spices'
  | 'Bakery'
  | 'Meat & Seafood'
  | 'Dairy & Eggs'
  | 'Pantry'
  | 'Frozen'
  | 'Beverages'
  | 'Other';

export interface SharedRecipe {
  id: string;
  fromUid: string;
  fromName: string;
  fromAvatar?: string;
  toEmail: string;
  recipe: Omit<Recipe, 'id' | 'userId'>;
  createdAt: string;
}

export interface CategoryOverrideLog {
  id: string;
  itemName: string;
  fromCategory: ShoppingCategory;
  toCategory: ShoppingCategory;
  timestamp: string; // ISO datetime
}

export interface PantryItem {
  id: string;
  name: string;           // display name e.g. "olive oil"
  normalizedName: string; // normalizeIngredientName(name) for matching
  category: ShoppingCategory;
  order?: number;
  createdAt: string;
  updatedAt?: number; // epoch ms of last change; reconciles snapshots by recency
}

// ── bistros ──────────────────────────────────────────────────────────────────
// A bistro is a shared library (recipes, meal plan, shopping list, pantry,
// known sources). Every user owns exactly one, keyed by their uid and stored at
// bistros/{uid}/…, and can be invited into other people's. See
// docs/APP_SPECIFICATION.md §12.1.

export interface BistroMember {
  name: string;
  email: string;
  avatar?: string;
  joinedAt: string; // ISO datetime
}

export interface Bistro {
  id: string; // === ownerUid
  name: string;
  ownerUid: string;
  createdAt: string;
  memberUids: string[]; // includes the owner
  members: Record<string, BistroMember>;
}

export interface BistroInvite {
  id: string;
  bistroId: string;
  bistroName: string;
  fromUid: string;
  fromName: string;
  fromAvatar?: string;
  toEmail: string; // lowercased
  createdAt: string;
}

// Progress of the one-time copy of a pre-bistro account's data from
// users/{uid}/… to bistros/{uid}/… (api/migrate-bistro.ts).
export interface MigrationState {
  status: 'running' | 'error';
  copied: number;
  error?: string;
}

export interface AppState {
  recipes: Recipe[];
  mealEntries: MealEntry[];
  shoppingItems: ShoppingItem[];
  // Soft-deleted shopping item ids → deletion clock. Persisted so a delete made
  // offline survives an app restart and a stale server copy arriving later
  // can't resurrect the item. Entries are pruned after TOMBSTONE_RETENTION_MS.
  shoppingTombstones: Record<string, number>;
  pantryItems: PantryItem[];
  knownSources: string[];
  hasGeminiApiKey: boolean;
  isAuthenticated: boolean;
  user: { uid: string; name: string; email: string; avatar?: string } | null;
  splashDone: boolean;
  // The bistro whose data is loaded. null means the user's own (id === uid).
  // Per-device: viewing a partner's bistro on one device doesn't switch others.
  activeBistroId: string | null;
  // The bistro to open on launch, chosen in Settings. null opens whichever was
  // open last (activeBistroId, persisted). Per-account: synced via the user's
  // profile so it applies on every device.
  defaultBistroId: string | null;
  // True once this account's data lives at bistros/{uid}/… (see MigrationState).
  // Until then reads and writes go to the legacy users/{uid}/… paths.
  bistroMigrated: boolean;
  // Bistros this user can open, keyed by id. The own bistro is always present
  // (synthesised if its doc hasn't been created yet).
  bistros: Record<string, Bistro>;
}
