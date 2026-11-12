import type { ShoppingCategory } from '../../types';

/** Aisle order for the shopping list and store cupboard, and the order category choices are shown in. */
export const CATEGORY_ORDER: ShoppingCategory[] = [
  'Vegetables',
  'Fruit',
  'Herbs & Spices',
  'Bakery',
  'Meat & Seafood',
  'Dairy & Eggs',
  'Pantry',
  'Frozen',
  'Beverages',
  'Other',
];

/** Position in the aisle order; a category we don't know sorts after all the others. */
export function categoryRank(category: string): number {
  const i = (CATEGORY_ORDER as string[]).indexOf(category);
  return i === -1 ? CATEGORY_ORDER.length : i;
}
