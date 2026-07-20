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
export type MealTime = 'breakfast' | 'lunch' | 'dinner' | 'snack';

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

export interface ShoppingItem {
  id: string;
  name: string; // full plain text e.g. "2 cups flour" or "chicken breast"
  category: ShoppingCategory;
  checked: boolean;
  order?: number;
  manual?: boolean;
  mealSources?: MealSource[];
  ingredientKey?: string; // normalizeIngredientName(name)__normalizeUnit(unit) for dedup
  // Epoch ms of the last content change (checked/name/category/add). Used to
  // reconcile the local copy with incoming Firestore snapshots by recency, so a
  // change that hasn't finished syncing is never clobbered by a stale snapshot.
  // Optional for backward compat with items written before this field existed.
  updatedAt?: number;
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

export interface AppState {
  recipes: Recipe[];
  mealEntries: MealEntry[];
  shoppingItems: ShoppingItem[];
  pantryItems: PantryItem[];
  knownSources: string[];
  hasGeminiApiKey: boolean;
  isAuthenticated: boolean;
  user: { uid: string; name: string; email: string; avatar?: string } | null;
  splashDone: boolean;
}
