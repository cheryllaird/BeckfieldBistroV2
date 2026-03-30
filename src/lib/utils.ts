import type { Ingredient, ShoppingItem, ShoppingCategory } from '../types';

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
  const map = new Map<string, ShoppingItem>();

  for (const { ingredients, servings, originalServings } of ingredientGroups) {
    for (const ing of ingredients) {
      const scaled = scaleIngredient(ing, originalServings, servings);
      const key = `${scaled.name.toLowerCase()}__${scaled.unit.toLowerCase()}`;
      const existing = map.get(key);
      if (existing) {
        map.set(key, { ...existing, quantity: Math.round((existing.quantity + scaled.quantity) * 100) / 100 });
      } else {
        map.set(key, {
          id: generateId(),
          name: scaled.name,
          quantity: scaled.quantity,
          unit: scaled.unit,
          category: categorize(scaled.name),
          checked: false,
        });
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => a.category.localeCompare(b.category));
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
