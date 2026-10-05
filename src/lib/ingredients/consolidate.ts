import type { Ingredient, MealSource, PantryItem, ShoppingCategory, ShoppingItem } from '../../types';
import { generateId } from '../utils';
import { formatItemName, ingredientUnit, leadingCount, readsAsPlural, round2, type IngredientAmount } from './amounts';
import { canonicalizeIngredientName, normalizeIngredientName } from './canonicalName';
import { categorize } from './categorize';
import { findPantryMatch } from './pantry';
import { isPluralWord, lastWord } from './words';

// Building the shopping list from planned meals. Every recipe line becomes a
// ListLine — scaled, keyed and named — and lines sharing a key become one item,
// whether the list is generated in one go (consolidateIngredients) or a meal
// is added to an existing list (mergeIntoShoppingList).

/** The ingredients of one planned meal, with the servings it's planned for. */
export interface IngredientGroup {
  ingredients: Ingredient[];
  servings: number;
  originalServings: number;
  mealEntryId?: string;
  recipeTitle?: string;
}

/** One recipe line, scaled to the plan and keyed for consolidation. */
interface ListLine {
  key: string;
  name: string;
  amount: IngredientAmount;
  source: MealSource;
}

function toListLine(ingredient: Ingredient, scale: number, mealEntryId: string, recipeTitle: string): ListLine {
  const unit = ingredientUnit(ingredient);
  // A count written into the name ("2 shallots") stands in for a missing quantity.
  const quantity = ingredient.quantity || (unit ? 0 : leadingCount(ingredient.name));
  const amount = { quantity: round2(quantity * scale), unit };
  return {
    key: normalizeIngredientName(ingredient.name),
    name: canonicalizeIngredientName(ingredient.name),
    amount,
    source: { mealEntryId, recipeTitle, scaledQuantity: amount.quantity, unit: amount.unit, ingredientName: ingredient.name },
  };
}

/**
 * The name to show for an item. Recipes write the same ingredient singular and
 * plural ("shallot", "shallots"); pick whichever spelling suits the total, so
 * the list reads "3 shallots" and "1 lemon".
 */
function displayName(names: readonly string[], amounts: readonly IngredientAmount[]): string {
  const plural = readsAsPlural(amounts);
  return names.find((name) => isPluralWord(lastWord(name)) === plural) ?? names[0];
}

/** The list label for a set of lines that share a key. */
function labelFor(lines: readonly Pick<ListLine, 'name' | 'amount'>[]): string {
  const amounts = lines.map((line) => line.amount);
  const names = [...new Set(lines.map((line) => line.name))];
  return formatItemName(amounts, displayName(names, amounts));
}

/** Rebuilds the lines an existing item was made from, out of its meal sources. */
function linesFromSources(sources: readonly MealSource[]): Pick<ListLine, 'name' | 'amount'>[] {
  return sources.map((source) => ({
    name: canonicalizeIngredientName(source.ingredientName),
    amount: { quantity: source.scaledQuantity, unit: source.unit },
  }));
}

/** Groups lines by key, keeping first-seen order. */
function groupByKey(lines: readonly ListLine[]): Map<string, ListLine[]> {
  const groups = new Map<string, ListLine[]>();
  for (const line of lines) {
    const group = groups.get(line.key);
    if (group) group.push(line);
    else groups.set(line.key, [line]);
  }
  return groups;
}

function servingsScale(servings: number, originalServings: number): number {
  return originalServings > 0 ? servings / originalServings : 1;
}

/**
 * Turns the planned meals' ingredients into shopping list items, one per thing
 * to buy, with amounts scaled to each meal's servings and totalled across meals.
 * Keyed on the ingredient alone, not the unit, so the same thing measured two
 * ways ("1 lemon", "2 tbsp lemon juice") lands on one line.
 */
export function consolidateIngredients(groups: readonly IngredientGroup[]): ShoppingItem[] {
  const lines = groups.flatMap(({ ingredients, servings, originalServings, mealEntryId, recipeTitle }) =>
    ingredients.map((ingredient) =>
      toListLine(ingredient, servingsScale(servings, originalServings), mealEntryId ?? '', recipeTitle ?? '')
    )
  );

  return Array.from(groupByKey(lines), ([key, keyed]) => {
    const name = labelFor(keyed);
    const category: ShoppingCategory = categorize(keyed[0].name);
    const sources = keyed.map((line) => line.source).filter((source) => source.mealEntryId && source.recipeTitle);
    return {
      id: generateId(),
      name,
      category,
      checked: false,
      mealSources: sources.length > 0 ? sources : undefined,
      ingredientKey: key,
    };
  }).sort((a, b) => a.category.localeCompare(b.category));
}

/**
 * Adds one meal's ingredients to an existing list, folding each into the item
 * already there for it. Adding the same meal twice changes nothing, and store
 * cupboard staples are never added.
 */
export function mergeIntoShoppingList(
  existing: ShoppingItem[],
  ingredients: Ingredient[],
  scale: number,
  mealEntryId?: string,
  recipeTitle?: string,
  pantryItems: readonly PantryItem[] = [],
): ShoppingItem[] {
  const result = [...existing];
  const lines = ingredients
    // Never add what the user already keeps in their store cupboard.
    .filter((ingredient) => !findPantryMatch(ingredient.name, pantryItems))
    .map((ingredient) => toListLine(ingredient, scale, mealEntryId ?? '', recipeTitle ?? ''));

  // A recipe can name one ingredient on several lines ("1 lemon", "juice of 1
  // lemon"); they're merged together, so every line counts towards the total.
  for (const [key, keyed] of groupByKey(lines)) {
    // Lists generated before consolidation went unit-agnostic carry keys of the
    // form "name__unit"; those items are still the same ingredient.
    const index = result.findIndex(
      (item) => item.ingredientKey === key || item.ingredientKey?.startsWith(`${key}__`)
    );
    const newSources = mealEntryId ? keyed.map((line) => line.source) : [];

    if (index >= 0) {
      const item = result[index];
      // Skip if this meal entry is already tracked as a source
      if (mealEntryId && item.mealSources?.some((s) => s.mealEntryId === mealEntryId)) continue;
      const sources = [...(item.mealSources ?? []), ...newSources];
      result[index] = {
        ...item,
        name: labelFor([...linesFromSources(item.mealSources ?? []), ...keyed]),
        mealSources: sources.length > 0 ? sources : undefined,
        ingredientKey: key,
      };
      continue;
    }

    const name = labelFor(keyed);
    // Fall back to text match for manually-added items without an ingredientKey
    if (result.some((item) => !item.ingredientKey && item.name.toLowerCase() === name.toLowerCase())) continue;
    result.push({
      id: generateId(),
      name,
      category: categorize(keyed[0].name),
      checked: false,
      mealSources: newSources.length > 0 ? newSources : undefined,
      ingredientKey: key,
    });
  }

  return result;
}
