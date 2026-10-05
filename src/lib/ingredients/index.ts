// Ingredient understanding for the shopping list: UK naming, units and
// amounts, aisle categories, store cupboard matching and consolidation.
export { formatItemName, formatQuantity, normalizeUnit, type IngredientAmount } from './amounts';
export { canonicalizeIngredientName, normalizeIngredientName } from './canonicalName';
export { categorize } from './categorize';
export { consolidateIngredients, mergeIntoShoppingList, type IngredientGroup } from './consolidate';
export { findPantryMatch, matchesPantryName, stripLeadingAmount } from './pantry';
