import type { Ingredient, MealEntry, PantryItem, Recipe, ShoppingItem } from '../types';

// Builders with sensible defaults, so each test states only the fields it is
// actually asserting on.

export function makeIngredient(overrides: Partial<Ingredient> = {}): Ingredient {
  const name = overrides.name ?? 'flour';
  return {
    name,
    quantity: 100,
    unit: 'g',
    originalText: `${overrides.quantity ?? 100}${overrides.unit ?? 'g'} ${name}`,
    ...overrides,
  };
}

export function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'recipe-1',
    userId: 'user-1',
    title: 'Test Recipe',
    source: 'Test Kitchen',
    servings: 4,
    prepTime: '10 mins',
    totalTime: '30 mins',
    ingredients: [makeIngredient()],
    steps: ['Mix.', 'Bake.'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeMealEntry(overrides: Partial<MealEntry> = {}): MealEntry {
  return {
    id: 'meal-1',
    date: '2026-03-18',
    type: 'recipe',
    recipeId: 'recipe-1',
    servings: 4,
    ...overrides,
  };
}

export function makeShoppingItem(overrides: Partial<ShoppingItem> = {}): ShoppingItem {
  return {
    id: 'item-1',
    name: 'milk',
    category: 'Dairy & Eggs',
    checked: false,
    ...overrides,
  };
}

export function makePantryItem(overrides: Partial<PantryItem> = {}): PantryItem {
  return {
    id: 'pantry-1',
    name: 'salt',
    normalizedName: 'salt',
    category: 'Pantry',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
