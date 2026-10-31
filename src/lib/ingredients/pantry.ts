import type { Ingredient, PantryItem, ShoppingItem, ShoppingListType } from '../../types';
import { generateId } from '../utils';
import { AMOUNT_UNIT_WORDS } from './amounts';
import { normalizeIngredientName } from './canonicalName';

// Matching recipe ingredients against the store cupboard, so staples the
// household always keeps never land on the shopping list.

// Words that describe a *variant* of a staple rather than a different
// ingredient — "sea salt" is still salt, "freshly ground black pepper" is still
// pepper. Stripped from either end of a name before matching against the store
// cupboard, so a cupboard staple suppresses its variants.
const PANTRY_QUALIFIER_PREFIXES = new Set([
  'best', 'caster', 'coarse', 'coarsely', 'cold', 'cracked', 'dried', 'dry',
  'extra', 'fine', 'finely', 'flaked', 'flaky', 'free', 'fresh', 'freshly',
  'full', 'golden', 'good', 'granulated', 'ground', 'kosher', 'large', 'light',
  'low', 'medium', 'natural', 'organic', 'plain', 'pressed', 'pure', 'quality',
  'range', 'raw', 'reduced', 'ripe', 'rock', 'salted', 'sea', 'semi', 'skimmed',
  'small', 'table', 'toasted', 'unsalted', 'unsweetened', 'unwaxed', 'virgin',
  'whole',
]);

// "flak" is what the singulariser makes of "flakes".
const PANTRY_QUALIFIER_SUFFIXES = new Set(['crystal', 'flak', 'flake', 'granule', 'grain']);

// Staples whose name doubles as the head noun of unrelated ingredients
// ("pepper" → bell pepper, "butter" → peanut butter). These only ever match by
// full name, never as the head noun of a longer ingredient.
const AMBIGUOUS_PANTRY_HEADS = new Set([
  'bean', 'butter', 'corn', 'cream', 'milk', 'onion', 'pea', 'pepper', 'squash',
  'sugar',
]);

const LEADING_AMOUNT = new RegExp(
  `^\\s*(?:[\\d./¼½¾⅓⅔⅛\\s-]+)?\\s*(?:(?:${AMOUNT_UNIT_WORDS.join('|')})\\.?\\s+)?`,
  'i'
);

/** Drops any leading quantity and unit from free text ("2 tsp sea salt" → "sea salt"). */
export function stripLeadingAmount(text: string): string {
  const stripped = text.replace(LEADING_AMOUNT, '').trim();
  return stripped || text.trim();
}

/** Strips variant qualifiers so "sea salt flakes" and "salt" compare equal. */
function pantryCoreName(normalizedName: string): string {
  let words = normalizedName.replace(/-/g, ' ').split(/\s+/).filter(Boolean);
  while (words.length > 1 && PANTRY_QUALIFIER_PREFIXES.has(words[0])) {
    words = words.slice(1);
  }
  while (words.length > 1 && PANTRY_QUALIFIER_SUFFIXES.has(words[words.length - 1])) {
    words = words.slice(0, -1);
  }
  return words.join(' ');
}

/**
 * Whether an ingredient is covered by a store cupboard staple. Matches the
 * staple itself, its variants ("salt" covers "sea salt"), and ingredients whose
 * head noun is the staple ("olive oil" covers "light olive oil") — except for
 * heads generic enough to catch unrelated ingredients.
 */
export function matchesPantryName(ingredientName: string, pantryNormalizedName: string): boolean {
  const ingredient = normalizeIngredientName(stripLeadingAmount(ingredientName));
  const pantry = normalizeIngredientName(pantryNormalizedName);
  if (!ingredient || !pantry) return false;
  if (ingredient === pantry) return true;

  const ingredientCore = pantryCoreName(ingredient);
  const pantryCore = pantryCoreName(pantry);
  if (ingredientCore === pantryCore) return true;
  if (AMBIGUOUS_PANTRY_HEADS.has(pantryCore)) return false;

  // Head-noun match, in either direction: "sunflower oil" vs cupboard "oil",
  // or "salt" vs cupboard "sea salt".
  return (
    ingredientCore.endsWith(` ${pantryCore}`) || pantryCore.endsWith(` ${ingredientCore}`)
  );
}

/** A cupboard item counts as in stock unless it has been explicitly switched off. */
export const isInStock = (p: PantryItem): boolean => p.inStock !== false;

/**
 * Returns the store cupboard staple covering this ingredient, if any. Items
 * marked out of stock cover nothing, so their ingredients are bought again.
 */
export function findPantryMatch(
  ingredientName: string,
  pantryItems: readonly PantryItem[]
): PantryItem | undefined {
  return pantryItems.find(
    (p) => isInStock(p) && matchesPantryName(ingredientName, p.normalizedName)
  );
}

/** A plain, unticked manual shopping item for a cupboard item that has run out. */
export function shoppingItemFromPantry(p: PantryItem, listType: ShoppingListType): ShoppingItem {
  return { id: generateId(), name: p.name, category: p.category, listType, checked: false, manual: true };
}

/** Whether an unticked item for this cupboard item is already on either shopping list. */
export function isOnShoppingList(p: PantryItem, items: readonly ShoppingItem[]): boolean {
  return items.some(
    (i) => !i.checked && normalizeIngredientName(stripLeadingAmount(i.name)) === p.normalizedName
  );
}

/** A recipe ingredient left off the list because the store cupboard covers it. */
export interface PantrySkip {
  /** Identifies the ingredient for "add anyway" — the same key the list line gets. */
  key: string;
  ingredient: Ingredient;
  pantryItem: PantryItem;
}

/**
 * Splits a recipe's ingredients into what to buy and what the store cupboard
 * covers. Both ways of adding a meal go through this, so they always agree.
 * Ingredients whose key is in `keepKeys` are bought anyway; they still appear in
 * `skipped` so the caller can show them as switched on.
 */
export function splitByPantry(
  ingredients: readonly Ingredient[],
  pantryItems: readonly PantryItem[],
  keepKeys: ReadonlySet<string> = new Set(),
): { toBuy: Ingredient[]; skipped: PantrySkip[] } {
  const toBuy: Ingredient[] = [];
  const skipped: PantrySkip[] = [];
  for (const ingredient of ingredients) {
    const pantryItem = findPantryMatch(ingredient.name, pantryItems);
    if (!pantryItem) {
      toBuy.push(ingredient);
      continue;
    }
    const key = normalizeIngredientName(ingredient.name);
    skipped.push({ key, ingredient, pantryItem });
    if (keepKeys.has(key)) toBuy.push(ingredient);
  }
  return { toBuy, skipped };
}
