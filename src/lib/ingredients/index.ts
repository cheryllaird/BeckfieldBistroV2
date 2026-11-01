// Ingredient understanding for the shopping list: UK naming, units and
// amounts, aisle categories, store cupboard matching and consolidation.
export { formatQuantity } from './amounts';
export { normalizeIngredientName } from './canonicalName';
export { categorize, defaultCategory } from './categorize';
export { categoryKey, itemCategoryKey } from './categoryOverrides';
export { consolidateIngredients, mergeIntoShoppingList, type IngredientGroup } from './consolidate';
export {
  isInStock,
  isOnShoppingList,
  shoppingItemFromPantry,
  splitByPantry,
  type PantrySkip,
} from './pantry';
