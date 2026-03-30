export interface Ingredient {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  notes?: string;
}

export interface Recipe {
  id: string;
  title: string;
  source: string;
  coverImage?: string;
  servings: number;
  totalTimeMinutes?: number;
  ingredients: Ingredient[];
  steps: string[];
  createdAt: string;
  updatedAt: string;
}

export type MealEntryType = 'recipe' | 'custom' | 'dining-out';

export interface MealEntry {
  id: string;
  date: string; // ISO date string e.g. "2026-03-30"
  type: MealEntryType;
  recipeId?: string;
  customTitle?: string;
  servings: number;
  location?: string; // for dining-out
}

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: ShoppingCategory;
  checked: boolean;
  manual?: boolean;
}

export type ShoppingCategory =
  | 'Produce'
  | 'Bakery'
  | 'Meat & Seafood'
  | 'Dairy & Eggs'
  | 'Pantry'
  | 'Frozen'
  | 'Beverages'
  | 'Other';

export interface AppState {
  recipes: Recipe[];
  mealEntries: MealEntry[];
  shoppingItems: ShoppingItem[];
  knownSources: string[];
  isAuthenticated: boolean;
  user: { name: string; email: string; avatar?: string } | null;
  splashDone: boolean;
}
