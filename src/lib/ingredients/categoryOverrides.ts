import type { ShoppingCategory, ShoppingItem } from '../../types';
import { normalizeIngredientName } from './canonicalName';
import { stripLeadingAmount } from './pantry';

// Aisles the household has chosen for ingredients, remembered per ingredient
// so a correction made once applies wherever that ingredient is added again —
// a generated list, a meal added from the plan, a typed item, the cupboard.
//
// Keyed like shopping list items (normalizeIngredientName), so "Rice noodles",
// "200 g rice noodles" and "rice noodle" all share one remembered choice.

/** Ingredient key → the aisle the household files it under. */
export type CategoryOverrides = Readonly<Record<string, ShoppingCategory>>;

/** The key a category choice is remembered under for free text ("2 tins tuna" → "tuna"). */
export function categoryKey(text: string): string {
  return normalizeIngredientName(stripLeadingAmount(text));
}

/**
 * The key for an item already on the list. Items built from recipes carry it
 * (older ones as "name__unit"); typed items are keyed from their text.
 */
export function itemCategoryKey(item: Pick<ShoppingItem, 'name' | 'ingredientKey'>): string {
  return item.ingredientKey?.split('__')[0] || categoryKey(item.name);
}
