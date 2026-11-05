// Ingredient understanding for the shopping list: UK naming, units and
// amounts, aisle categories, store cupboard matching and consolidation.
export { formatQuantity } from './amounts';
export { normalizeIngredientName } from './canonicalName';
export { categorize, defaultCategory } from './categorize';
export { CATEGORY_ORDER, categoryRank } from './categoryOrder';
export { SHELF_ORDER, defaultShelf, shelfOf, shelfRank, type ShelfOverrides } from './shelves';
export { categoryKey, itemCategoryKey } from './categoryOverrides';
export {
  consolidateIngredients,
  mergeIntoShoppingList,
  previewMealAdd,
  type IngredientGroup,
} from './consolidate';
export {
  isInStock,
  isOnShoppingList,
  shoppingItemFromPantry,
  splitByPantry,
} from './pantry';
