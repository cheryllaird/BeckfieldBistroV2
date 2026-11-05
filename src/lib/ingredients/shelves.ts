import type { PantryShelf } from '../../types';
import { categoryKey } from './categoryOverrides';
import { keywordPattern } from './categorize';
import { toUkNames } from './ukNames';
import { foldDiacritics } from './words';

/** Shelf order, used for the picker and for sorting Pantry items. */
export const SHELF_ORDER: PantryShelf[] = [
  'Oils & Vinegars',
  'Condiments & Sauces',
  'Pasta, Rice & Grains',
  'Tins & Jars',
  'Baking',
  'Nuts, Seeds & Dried Fruit',
  'Spreads & Syrups',
  'Other pantry',
];

/** Ingredient key → the shelf the household files it on. */
export type ShelfOverrides = Readonly<Record<string, PantryShelf>>;

// Same matching rules as the aisle keywords (categorize.ts): whole words,
// singular or plural, and the most specific match wins — more words, then more
// letters. So "olive oil" (Oils) beats "olive" (Tins & Jars) and "peanut
// butter" (Spreads) beats "peanut" (Nuts). Anything unmatched is "Other pantry".
const SHELF_KEYWORDS: Record<Exclude<PantryShelf, 'Other pantry'>, string[]> = {
  'Oils & Vinegars': ['oil', 'olive oil', 'sesame oil', 'vinegar'],
  'Condiments & Sauces': [
    'caper', 'chutney', 'fish sauce', 'harissa', 'hot sauce', 'ketchup', 'mayonnaise', 'miso',
    'mustard', 'oyster sauce', 'pesto', 'pickle', 'relish', 'sauce', 'soy sauce', 'sriracha',
    'teriyaki', 'worcestershire',
  ],
  'Pasta, Rice & Grains': [
    'bulgur', 'conchiglie', 'couscous', 'egg noodle', 'farfalle', 'fettuccine', 'fusilli',
    'gnocchi', 'granola', 'lasagne', 'linguine', 'macaroni', 'noodle', 'oat', 'orecchiette',
    'orzo', 'pappardelle', 'pasta', 'penne', 'polenta', 'quinoa', 'rice', 'rice noodle',
    'rigatoni', 'risotto', 'spaghetti', 'tagliatelle',
  ],
  'Tins & Jars': [
    'artichoke', 'bean', 'black bean', 'chickpea', 'chopped tomato', 'coconut cream',
    'coconut milk', 'jar', 'kidney bean', 'lentil', 'olive', 'passata', 'tin', 'tinned',
    'tinned tomato', 'tomato purée',
  ],
  Baking: [
    'arrowroot', 'baking', 'bicarbonate', 'brown sugar', 'caster sugar', 'chocolate', 'cocoa',
    'cornflour', 'cornmeal', 'flour', 'icing sugar', 'sugar', 'tapioca', 'vanilla', 'yeast',
  ],
  'Nuts, Seeds & Dried Fruit': [
    'almond', 'cashew', 'chestnut', 'dried apricot', 'dried cranberry', 'dried fig',
    'dried fruit', 'dried mango', 'hazelnut', 'nut', 'pecan', 'pine nut', 'pistachio', 'prune',
    'raisin', 'seed', 'sesame', 'sultana', 'sunflower seed', 'walnut',
  ],
  'Spreads & Syrups': [
    'almond butter', 'golden syrup', 'honey', 'jam', 'jelly', 'maple syrup', 'marmalade',
    'molasses', 'peanut butter', 'preserve', 'syrup', 'tahini', 'treacle',
  ],
};

interface ShelfKeyword {
  shelf: PantryShelf;
  pattern: RegExp;
  words: number;
  letters: number;
}

const KEYWORDS: ShelfKeyword[] = Object.entries(SHELF_KEYWORDS).flatMap(([shelf, keywords]) =>
  keywords.map((keyword) => {
    const folded = foldDiacritics(keyword);
    return {
      shelf: shelf as PantryShelf,
      pattern: keywordPattern(folded),
      words: folded.split(' ').length,
      letters: folded.length,
    };
  }),
);

/** The shelf the keyword tables put an ingredient on, ignoring household choices. */
export function defaultShelf(name: string): PantryShelf {
  const text = foldDiacritics(toUkNames(name.toLowerCase()));
  let best: ShelfKeyword | undefined;
  for (const keyword of KEYWORDS) {
    if (!keyword.pattern.test(text)) continue;
    if (
      !best ||
      keyword.words > best.words ||
      (keyword.words === best.words && keyword.letters > best.letters)
    ) {
      best = keyword;
    }
  }
  return best?.shelf ?? 'Other pantry';
}

/**
 * The Pantry shelf an ingredient sits on: the household's own choice if they've
 * made one, otherwise the best keyword match. Only meaningful for items in the
 * Pantry category; callers check the category first.
 */
export function shelfOf(name: string, shelfOverrides: ShelfOverrides = {}): PantryShelf {
  return shelfOverrides[categoryKey(name)] ?? defaultShelf(name);
}

/** Position in the shelf order, for sorting. */
export function shelfRank(shelf: PantryShelf): number {
  return SHELF_ORDER.indexOf(shelf);
}
