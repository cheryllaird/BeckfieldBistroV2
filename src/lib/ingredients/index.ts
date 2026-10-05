// Ingredient understanding for the shopping list: UK naming, units and
// amounts, aisle categories, store cupboard matching and consolidation.
export { formatItemName, formatQuantity, normalizeUnit, type IngredientAmount } from './amounts';
export { canonicalizeIngredientName, normalizeIngredientName } from './canonicalName';
export { categorize, defaultCategory } from './categorize';
export { categoryKey, itemCategoryKey, type CategoryOverrides } from './categoryOverrides';
export { consolidateIngredients, mergeIntoShoppingList, type IngredientGroup, type MergeOptions } from './consolidate';
export { findPantryMatch, matchesPantryName, stripLeadingAmount } from './pantry';
