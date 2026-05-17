import type { Ingredient, IngredientSection, MealSource, Recipe, ShoppingItem, ShoppingCategory } from '../types';

// American English → canonical English synonyms applied at word level
const WORD_SYNONYMS: Array<[RegExp, string]> = [
  [/\bcilantro\b/g, 'coriander'],
  [/\bzucchini\b/g, 'courgette'],
  [/\beggplant\b/g, 'aubergine'],
  [/\bscallion\b/g, 'spring onion'],
  [/\bgreen onion\b/g, 'spring onion'],
  [/\barugula\b/g, 'rocket'],
];

function singularWord(word: string): string {
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
  if (word.endsWith('es') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('is') && word.length > 3) return word.slice(0, -1);
  return word;
}

const UNIT_NORMALIZE_MAP: Record<string, string> = {
  gram: 'g', grams: 'g',
  kilogram: 'kg', kilograms: 'kg',
  ounce: 'oz', ounces: 'oz',
  pound: 'lb', pounds: 'lb', lbs: 'lb',
  milliliter: 'ml', millilitre: 'ml', milliliters: 'ml', millilitres: 'ml',
  liter: 'l', litre: 'l', liters: 'l', litres: 'l',
  teaspoon: 'tsp', teaspoons: 'tsp',
  tablespoon: 'tbsp', tablespoons: 'tbsp',
  cups: 'cup',
  piece: '', pieces: '', each: '', whole: '',
  clove: '', cloves: '',
};

export function normalizeUnit(unit: string): string {
  const lower = unit.toLowerCase().trim();
  return Object.prototype.hasOwnProperty.call(UNIT_NORMALIZE_MAP, lower)
    ? UNIT_NORMALIZE_MAP[lower]
    : lower;
}

/** Returns the canonical display name for an ingredient (normalises synonyms, strips redundant modifiers). */
export function canonicalizeIngredientName(name: string): string {
  let s = name.toLowerCase().trim();

  // Rewrite "juice of [N] ingredient" → "[ingredient]" so it consolidates with the whole fruit/veg
  s = s.replace(/^juice of (?:\d+(?:[./]\d+)?\s+)?(.+)$/, (_, ingredient) => {
    const words = ingredient.trim().split(/\s+/);
    words[words.length - 1] = singularWord(words[words.length - 1]);
    return words.join(' ');
  });

  // Strip " juice" from lemons and limes so "lemon juice" / "1 lemon juice" consolidates with "lemon"
  s = s.replace(/^(lemon|lime)s?\s+juice$/, '$1');

  // Strip leading quality/preparation modifiers
  s = s.replace(/^extra[- ]virgin\s+/, '');
  s = s.replace(/^flat[- ]leaf(?:ed)?\s+/, '');

  // Strip trailing preparation/portioning descriptors
  s = s.replace(/\s+leaves?$/, '');
  s = s.replace(/\s+stalks?$/, '');
  s = s.replace(/\s+sprigs?$/, '');
  s = s.replace(/\s+cloves?$/, '');   // "garlic cloves" → "garlic"
  s = s.replace(/\s+wedges?$/, '');   // "lemon wedges" → "lemon"

  // Apply regional/American-English synonyms
  for (const [pattern, replacement] of WORD_SYNONYMS) {
    s = s.replace(pattern, replacement);
  }

  return s.trim();
}

export function normalizeIngredientName(name: string): string {
  const s = canonicalizeIngredientName(name);
  // Singularise for deduplication key generation
  if (s.endsWith('ies') && s.length > 4) return s.slice(0, -3) + 'y';
  if (s.endsWith('es') && s.length > 4) return s.slice(0, -2);
  if (
    s.endsWith('s') &&
    !s.endsWith('ss') &&
    !s.endsWith('us') &&
    !s.endsWith('is') &&
    s.length > 3
  ) return s.slice(0, -1);
  return s;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Returns a flat ingredient list from a recipe, preferring ingredientSections when present. */
export function getRecipeIngredients(recipe: Pick<Recipe, 'ingredients' | 'ingredientSections'>): Ingredient[] {
  if (recipe.ingredientSections?.length) {
    return recipe.ingredientSections.flatMap((s: IngredientSection) => s.ingredients);
  }
  return recipe.ingredients;
}

export function scaleIngredient(ingredient: Ingredient, originalServings: number, newServings: number): Ingredient {
  const ratio = newServings / originalServings;
  return { ...ingredient, quantity: Math.round(ingredient.quantity * ratio * 100) / 100 };
}

export function formatQuantity(quantity: number): string {
  if (quantity === Math.floor(quantity)) return String(quantity);
  // Convert to fractions for common values
  const fractions: Record<number, string> = {
    0.25: '¼', 0.5: '½', 0.75: '¾',
    0.33: '⅓', 0.67: '⅔',
    0.125: '⅛',
  };
  const rounded = Math.round(quantity * 1000) / 1000;
  const whole = Math.floor(rounded);
  const frac = Math.round((rounded - whole) * 1000) / 1000;
  const fracStr = fractions[frac];
  if (fracStr) return whole > 0 ? `${whole} ${fracStr}` : fracStr;
  return String(rounded);
}

// Order matters: first match wins, so more specific categories come first.
const CATEGORY_KEYWORDS: Record<ShoppingCategory, string[]> = {
  Frozen: ['edamame', 'frozen', 'ice cream', 'sorbet'],
  'Meat & Seafood': [
    'anchovy', 'bacon', 'beef', 'brisket', 'chicken', 'chorizo', 'clam', 'cod', 'crab',
    'duck', 'fish', 'guanciale', 'haddock', 'halibut', 'ham', 'herring', 'lamb', 'lobster',
    'mackerel', 'mince', 'mussel', 'octopus', 'oyster', 'pancetta', 'pepperoni', 'pork',
    'prawn', 'rib', 'salmon', 'sardine', 'sausage', 'scallop', 'seafood', 'shrimp', 'squid',
    'steak', 'tilapia', 'trout', 'tuna', 'turkey', 'veal', 'venison',
  ],
  'Dairy & Eggs': [
    'brie', 'butter', 'buttermilk', 'camembert', 'cheddar', 'cheese', 'colby',
    'cottage cheese', 'cream', 'crème fraîche', 'egg', 'emmental', 'feta', 'ghee',
    'gouda', 'gruyere', 'half-and-half', 'halloumi', 'jack cheese', 'kefir', 'lard',
    'mascarpone', 'milk', 'monterey', 'mozzarella', 'paneer', 'parmesan', 'pecorino',
    'provolone', 'quark', 'ricotta', 'stilton', 'yoghurt', 'yogurt',
  ],
  Bakery: [
    'bagel', 'baguette', 'biscuit', 'bread', 'brioche', 'bun', 'ciabatta', 'crumpet',
    'flatbread', 'focaccia', 'muffin', 'naan', 'pita', 'pitta', 'pretzel', 'roll',
    'scone', 'sourdough', 'tortilla', 'waffle', 'wrap',
  ],
  Fruit: [
    'apple', 'apricot', 'banana', 'berry', 'blueberr', 'cantaloupe', 'cherry', 'coconut',
    'currant', 'fig', 'grape', 'grapefruit', 'kiwi', 'lemon', 'lime', 'mango', 'melon',
    'nectarine', 'orange', 'peach', 'pear', 'pineapple', 'plum', 'pomegranate', 'raspberry',
    'strawberry', 'tangerine', 'watermelon',
  ],
  Beverages: [
    'beer', 'cider', 'coffee', 'espresso', 'gin', 'juice', 'kombucha', 'lemonade',
    'prosecco', 'rum', 'seltzer', 'smoothie', 'soda', 'sparkling water', 'spirits',
    'sports drink', 'tea', 'tonic water', 'vodka', 'water', 'whiskey', 'wine',
  ],
  Vegetables: [
    'artichoke', 'arugula', 'asparagus', 'aubergine', 'avocado', 'bean sprout', 'beetroot',
    'cherry tomato',
    'bell pepper', 'bok choy', 'broccoli', 'brussels sprout', 'cabbage', 'capsicum', 'carrot',
    'cauliflower', 'celery', 'courgette', 'cucumber', 'eggplant', 'endive', 'fennel',
    'green bean', 'green onion', 'jalapeño', 'kale', 'leek', 'lettuce', 'mushroom', 'okra',
    'onion', 'parsnip', 'pea', 'pepper', 'potato', 'pumpkin', 'radish', 'rhubarb', 'scallion',
    'shallot', 'spinach', 'spring onion', 'squash', 'sweet potato', 'sweetcorn', 'swiss chard',
    'tomato', 'turnip', 'yam', 'zucchini',
  ],
  'Herbs & Spices': [
    'basil', 'chilli', 'chive', 'cilantro', 'coriander', 'dill', 'garlic', 'ginger', 'mint',
    'oregano', 'parsley', 'rosemary', 'sage', 'tarragon', 'thyme',
  ],
  Pantry: [
    'almond', 'arrowroot', 'baking', 'bean', 'black bean', 'breadcrumb', 'broth', 'brown rice',
    'brown sugar', 'capers', 'cardamom', 'cashew', 'cayenne', 'chickpea', 'chili powder',
    'chocolate', 'cinnamon', 'clove', 'cocoa', 'coconut milk', 'cornmeal', 'cornstarch',
    'cracker', 'cumin', 'dried', 'fish sauce', 'flour', 'garbanzo', 'granola', 'hazelnut',
    'egg noodle', 'honey', 'hot sauce', 'jam', 'jelly', 'ketchup', 'kidney bean', 'lentil', 'maple syrup',
    'marmalade', 'mayonnaise', 'molasses', 'mustard', 'noodle', 'nut', 'nutmeg', 'oat',
    'oil', 'olive', 'oyster sauce', 'paprika', 'pasta', 'peanut', 'peanut butter', 'penne', 'pickle',
    'pine nut', 'pistachio', 'powder', 'preserve', 'rice', 'risotto', 'salt', 'sauce',
    'sesame', 'soy sauce', 'spaghetti', 'spice', 'stock', 'sugar', 'sunflower seed', 'syrup',
    'tahini', 'tapioca', 'teriyaki', 'tomato paste', 'turmeric', 'vanilla', 'vinegar', 'walnut',
    'worcestershire',
  ],
  Other: [],
};

export function categorize(name: string): ShoppingCategory {
  const lower = name.toLowerCase();
  let bestMatch: { cat: ShoppingCategory; keywordLength: number } | null = null;
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as [ShoppingCategory, string[]][]) {
    if (cat === 'Other') continue;
    for (const kw of keywords) {
      if (lower.includes(kw) && kw.length > (bestMatch?.keywordLength ?? 0)) {
        bestMatch = { cat: cat as ShoppingCategory, keywordLength: kw.length };
      }
    }
  }
  return bestMatch?.cat ?? 'Other';
}

export function consolidateIngredients(
  ingredientGroups: {
    ingredients: Ingredient[];
    servings: number;
    originalServings: number;
    mealEntryId?: string;
    recipeTitle?: string;
  }[]
): ShoppingItem[] {
  const map = new Map<string, {
    quantity: number;
    unit: string;
    name: string;
    category: ShoppingCategory;
    sources: MealSource[];
  }>();

  for (const { ingredients, servings, originalServings, mealEntryId, recipeTitle } of ingredientGroups) {
    for (const ing of ingredients) {
      const scaled = scaleIngredient(ing, originalServings, servings);
      const key = `${normalizeIngredientName(scaled.name)}__${normalizeUnit(scaled.unit)}`;
      const existing = map.get(key);
      const newSource: MealSource | undefined =
        mealEntryId && recipeTitle
          ? { mealEntryId, recipeTitle, scaledQuantity: scaled.quantity, unit: scaled.unit, ingredientName: scaled.name }
          : undefined;
      if (existing) {
        map.set(key, {
          ...existing,
          quantity: Math.round((existing.quantity + scaled.quantity) * 100) / 100,
          sources: newSource ? [...existing.sources, newSource] : existing.sources,
        });
      } else {
        map.set(key, {
          quantity: scaled.quantity,
          unit: normalizeUnit(scaled.unit),
          name: canonicalizeIngredientName(scaled.name),
          category: categorize(scaled.name),
          sources: newSource ? [newSource] : [],
        });
      }
    }
  }

  return Array.from(map.entries())
    .map(([key, { quantity, unit, name, category, sources }]) => ({
      id: generateId(),
      name: [quantity > 0 ? formatQuantity(quantity) : '', unit, name].filter(Boolean).join(' '),
      category,
      checked: false,
      mealSources: sources.length > 0 ? sources : undefined,
      ingredientKey: key,
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

export function mergeIntoShoppingList(
  existing: ShoppingItem[],
  ingredients: Ingredient[],
  scale: number,
  mealEntryId?: string,
  recipeTitle?: string,
): ShoppingItem[] {
  const result = [...existing];

  for (const ing of ingredients) {
    const scaledQty = Math.round(ing.quantity * scale * 100) / 100;
    const normUnit = normalizeUnit(ing.unit);
    const key = `${normalizeIngredientName(ing.name)}__${normUnit}`;
    const canonicalName = canonicalizeIngredientName(ing.name);

    const existingIndex = result.findIndex((item) => item.ingredientKey === key);

    if (existingIndex >= 0) {
      const existingItem = result[existingIndex];
      // Skip if this meal entry is already tracked as a source
      if (mealEntryId && existingItem.mealSources?.some((s) => s.mealEntryId === mealEntryId)) {
        continue;
      }
      const newSource: MealSource = {
        mealEntryId: mealEntryId ?? '',
        recipeTitle: recipeTitle ?? '',
        scaledQuantity: scaledQty,
        unit: ing.unit,
        ingredientName: ing.name,
      };
      const newSources = [...(existingItem.mealSources ?? []), newSource];
      const totalQty = Math.round(newSources.reduce((sum, s) => sum + s.scaledQuantity, 0) * 100) / 100;
      result[existingIndex] = {
        ...existingItem,
        name: [totalQty > 0 ? formatQuantity(totalQty) : '', normUnit, canonicalName].filter(Boolean).join(' '),
        mealSources: newSources,
      };
    } else {
      // Fall back to text match for manually-added items without an ingredientKey
      const text = [scaledQty > 0 ? formatQuantity(scaledQty) : '', normUnit, canonicalName].filter(Boolean).join(' ');
      if (result.some((item) => item.name.toLowerCase() === text.toLowerCase() && !item.ingredientKey)) {
        continue;
      }
      const newSource: MealSource | undefined = mealEntryId
        ? { mealEntryId, recipeTitle: recipeTitle ?? '', scaledQuantity: scaledQty, unit: ing.unit, ingredientName: ing.name }
        : undefined;
      result.push({
        id: generateId(),
        name: text,
        category: categorize(ing.name),
        checked: false,
        mealSources: newSource ? [newSource] : undefined,
        ingredientKey: key,
      });
    }
  }

  return result;
}

export function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getWeekDays(weekOffset: number = 0): Date[] {
  const today = new Date();
  const monday = new Date(today);
  // Get this Monday
  const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1;
  monday.setDate(today.getDate() - dayOfWeek + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export function formatDayLabel(date: Date): { weekday: string; monthDay: string; isToday: boolean } {
  const today = new Date();
  const isToday = isoDate(date) === isoDate(today);
  return {
    weekday: date.toLocaleDateString('en-GB', { weekday: 'short' }),
    monthDay: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    isToday,
  };
}
