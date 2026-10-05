import type { ShoppingCategory } from '../../types';
import { categoryKey, type CategoryOverrides } from './categoryOverrides';
import { toUkNames } from './ukNames';
import { foldDiacritics } from './words';

// Supermarket aisle keywords, in UK names only: categorize() maps US names to
// UK ones first. The most specific match wins — more words, then more letters —
// so "cherry tomato" beats "cherry" and "coconut milk" beats "milk".
const CATEGORY_KEYWORDS: Record<Exclude<ShoppingCategory, 'Other'>, string[]> = {
  Frozen: ['edamame', 'frozen', 'ice cream', 'sorbet'],
  'Meat & Seafood': [
    'anchovy', 'bacon', 'beef', 'brisket', 'chicken', 'chorizo', 'clam', 'cod', 'crab',
    'duck', 'fish', 'guanciale', 'haddock', 'halibut', 'ham', 'herring', 'lamb', 'lobster',
    'mackerel', 'mince', 'mussel', 'octopus', 'oyster', 'pancetta', 'pepperoni', 'pork',
    'prawn', 'rib', 'salmon', 'sardine', 'sausage', 'scallop', 'seafood', 'squid',
    'steak', 'tilapia', 'trout', 'tuna', 'turkey', 'veal', 'venison',
  ],
  'Dairy & Eggs': [
    'brie', 'butter', 'buttermilk', 'camembert', 'cheddar', 'cheese', 'colby',
    'cottage cheese', 'cream', 'crème fraîche', 'egg', 'emmental', 'feta', 'ghee',
    'gouda', 'gruyere', 'half-and-half', 'halloumi', 'jack cheese', 'kefir', 'lard',
    'mascarpone', 'milk', 'monterey', 'mozzarella', 'paneer', 'parmesan', 'pecorino',
    'provolone', 'quark', 'ricotta', 'stilton', 'yoghurt',
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
    'artichoke', 'asparagus', 'aubergine', 'avocado', 'bean sprout', 'beetroot',
    'cherry tomato', 'bell pepper', 'broccoli', 'brussels sprout', 'cabbage', 'capsicum',
    'carrot', 'cauliflower', 'celeriac', 'celery', 'courgette', 'cucumber', 'endive', 'fennel',
    'green bean', 'jalapeño', 'kale', 'leek', 'lettuce', 'mangetout', 'mushroom', 'okra',
    'onion', 'pak choi', 'parsnip', 'pea', 'pepper', 'potato', 'pumpkin', 'radish', 'rhubarb',
    'rocket', 'salad', 'shallot', 'spinach', 'spring onion', 'squash', 'swede', 'sweet potato',
    'sweetcorn', 'swiss chard', 'tomato', 'turnip', 'yam',
  ],
  'Herbs & Spices': [
    'allspice', 'anise', 'basil', 'bay leaf', 'black pepper', 'caraway', 'cardamom', 'cayenne',
    'chilli', 'chive', 'cinnamon', 'clove', 'coriander', 'cumin', 'curry', 'dill',
    'fennel seed', 'fenugreek', 'garlic', 'ginger', 'lemongrass', 'mace', 'marjoram', 'mint',
    'mustard seed', 'nutmeg', 'onion powder', 'oregano', 'paprika', 'parsley', 'peppercorn',
    'kaffir lime', 'lime leaf', 'lime leaves', 'curry leaf', 'curry leaves',
    'rosemary', 'saffron', 'sage', 'spice', 'star anise', 'sumac', 'tarragon', 'thyme',
    'turmeric',
  ],
  Pantry: [
    'almond', 'arrowroot', 'baking', 'bean', 'bicarbonate', 'black bean', 'breadcrumb',
    'broth', 'brown rice', 'brown sugar', 'capers', 'cashew', 'chickpea', 'chocolate', 'cocoa',
    'coconut milk', 'cornflour', 'cornmeal', 'cracker', 'dried', 'egg noodle', 'fish sauce',
    'flour', 'granola', 'hazelnut', 'honey', 'hot sauce', 'jam', 'jelly', 'ketchup',
    'kidney bean', 'lentil', 'maple syrup', 'marmalade', 'mayonnaise', 'molasses', 'mustard',
    'noodle', 'nut', 'oat', 'oil', 'olive', 'oyster sauce', 'pasta', 'peanut', 'peanut butter',
    'penne', 'pickle', 'pine nut', 'pistachio', 'preserve', 'raisin', 'rice', 'risotto', 'salt',
    'sauce', 'sesame', 'soy sauce', 'spaghetti', 'stock', 'sugar', 'sultana', 'sunflower seed',
    'syrup', 'tahini', 'tapioca', 'teriyaki', 'tinned', 'chopped tomato', 'tomato purée', 'vanilla', 'vinegar', 'walnut',
    'worcestershire',
  ],
};

interface Keyword {
  category: ShoppingCategory;
  // Anchored to the start of a word, so "oil" doesn't match "boil" and "tea"
  // doesn't match "steak", while "chilli" still matches "chillies".
  pattern: RegExp;
  words: number;
  letters: number;
}

const KEYWORDS: Keyword[] = Object.entries(CATEGORY_KEYWORDS).flatMap(([category, keywords]) =>
  keywords.map((keyword) => {
    const folded = foldDiacritics(keyword);
    return {
      category: category as ShoppingCategory,
      pattern: new RegExp(`(?:^|[^a-z])${folded.replace(/[-]/g, '\\-')}`),
      words: folded.split(' ').length,
      letters: folded.length,
    };
  })
);

/**
 * The supermarket aisle an ingredient is found in: the household's own choice
 * if they've made one, otherwise the best keyword match.
 */
export function categorize(name: string, overrides: CategoryOverrides = {}): ShoppingCategory {
  return overrides[categoryKey(name)] ?? defaultCategory(name);
}

/** The aisle the keyword tables put an ingredient in, ignoring household choices. */
export function defaultCategory(name: string): ShoppingCategory {
  const text = foldDiacritics(toUkNames(name.toLowerCase()));
  let best: Keyword | undefined;
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
  return best?.category ?? 'Other';
}
