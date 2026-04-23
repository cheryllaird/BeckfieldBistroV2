import type { Ingredient, ShoppingItem, ShoppingCategory } from '../types';

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
};

export function normalizeUnit(unit: string): string {
  const lower = unit.toLowerCase().trim();
  return Object.prototype.hasOwnProperty.call(UNIT_NORMALIZE_MAP, lower)
    ? UNIT_NORMALIZE_MAP[lower]
    : lower;
}

export function normalizeIngredientName(name: string): string {
  const lower = name.toLowerCase().trim();
  if (lower.endsWith('ies') && lower.length > 4) return lower.slice(0, -3) + 'y';
  if (lower.endsWith('es') && lower.length > 4) return lower.slice(0, -2);
  if (
    lower.endsWith('s') &&
    !lower.endsWith('ss') &&
    !lower.endsWith('us') &&
    !lower.endsWith('is') &&
    lower.length > 3
  ) return lower.slice(0, -1);
  return lower;
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

const CATEGORY_KEYWORDS: Record<ShoppingCategory, string[]> = {
  Produce: ['apple', 'banana', 'berry', 'blueberr', 'carrot', 'celery', 'garlic', 'ginger',
    'herb', 'kale', 'lemon', 'lettuce', 'lime', 'mint', 'mushroom', 'onion', 'parsley',
    'potato', 'spinach', 'thyme', 'tomato', 'zucchini', 'pepper', 'cucumber', 'broccoli',
    'avocado', 'courgette', 'basil', 'coriander', 'rosemary', 'leek', 'shallot'],
  Bakery: ['bread', 'bun', 'flour', 'muffin', 'roll', 'sourdough', 'tortilla', 'wrap', 'pita', 'bagel'],
  'Meat & Seafood': ['bacon', 'beef', 'chicken', 'chorizo', 'guanciale', 'ham', 'lamb', 'pancetta',
    'pork', 'prawn', 'salmon', 'sausage', 'shrimp', 'steak', 'tuna', 'turkey', 'fish'],
  'Dairy & Eggs': ['butter', 'cheese', 'cream', 'egg', 'milk', 'mozzarella', 'parmesan', 'pecorino',
    'ricotta', 'yogurt', 'brie', 'cheddar'],
  Pantry: ['baking', 'bean', 'broth', 'canned', 'cumin', 'flour', 'lentil', 'noodle', 'oil',
    'olive oil', 'pasta', 'pepper', 'rice', 'salt', 'sauce', 'spice', 'stock', 'sugar',
    'soy sauce', 'vinegar', 'honey', 'mustard', 'ketchup', 'mayonnaise', 'cornstarch',
    'baking powder', 'baking soda', 'vanilla', 'chocolate', 'cocoa', 'spaghetti'],
  Frozen: ['frozen', 'ice cream', 'peas'],
  Beverages: ['beer', 'coffee', 'juice', 'milk', 'tea', 'water', 'wine'],
  Other: [],
};

export function categorize(name: string): ShoppingCategory {
  const lower = name.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as [ShoppingCategory, string[]][]) {
    if (cat === 'Other') continue;
    if (keywords.some((kw) => lower.includes(kw))) return cat;
  }
  return 'Other';
}

export function consolidateIngredients(
  ingredientGroups: { ingredients: Ingredient[]; servings: number; originalServings: number }[]
): ShoppingItem[] {
  const map = new Map<string, { quantity: number; unit: string; name: string; category: ShoppingCategory }>();

  for (const { ingredients, servings, originalServings } of ingredientGroups) {
    for (const ing of ingredients) {
      const scaled = scaleIngredient(ing, originalServings, servings);
      const key = `${normalizeIngredientName(scaled.name)}__${normalizeUnit(scaled.unit)}`;
      const existing = map.get(key);
      if (existing) {
        map.set(key, { ...existing, quantity: Math.round((existing.quantity + scaled.quantity) * 100) / 100 });
      } else {
        map.set(key, {
          quantity: scaled.quantity,
          unit: scaled.unit,
          name: scaled.name,
          category: categorize(scaled.name),
        });
      }
    }
  }

  return Array.from(map.values())
    .map(({ quantity, unit, name, category }) => ({
      id: generateId(),
      name: [quantity > 0 ? formatQuantity(quantity) : '', unit, name].filter(Boolean).join(' '),
      category,
      checked: false,
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

export function mergeIntoShoppingList(
  existing: ShoppingItem[],
  ingredients: Ingredient[],
  scale: number
): ShoppingItem[] {
  const result = [...existing];

  for (const ing of ingredients) {
    const scaledQty = Math.round(ing.quantity * scale * 100) / 100;
    const text = [scaledQty > 0 ? formatQuantity(scaledQty) : '', ing.unit, ing.name]
      .filter(Boolean)
      .join(' ');
    if (!result.some((item) => item.name.toLowerCase() === text.toLowerCase())) {
      result.push({
        id: generateId(),
        name: text,
        category: categorize(ing.name),
        checked: false,
      });
    }
  }

  return result;
}

export function isoDate(date: Date): string {
  return date.toISOString().split('T')[0];
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
