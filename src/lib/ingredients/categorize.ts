import type { ShoppingCategory } from '../../types';
import { categoryKey, type CategoryOverrides } from './categoryOverrides';
import { toUkNames } from './ukNames';
import { foldDiacritics } from './words';

// Supermarket aisle keywords, in UK names only: categorize() maps US names to
// UK ones first. Each matches as a whole word, singular or plural, and the most
// specific match wins — more words, then more letters — so "cherry tomato"
// beats "cherry" and "coconut milk" beats "milk".
const CATEGORY_KEYWORDS: Record<Exclude<ShoppingCategory, 'Other'>, string[]> = {
  Frozen: ['edamame', 'frozen', 'ice cream', 'sorbet'],
  'Meat & Seafood': [
    'anchovy', 'bacon', 'beef', 'brisket', 'chicken', 'chorizo', 'clam', 'cod', 'crab',
    'duck', 'fish', 'guanciale', 'haddock', 'halibut', 'ham', 'herring', 'lamb', 'lobster',
    'gammon', 'mackerel', 'meat', 'mince', 'monkfish', 'mussel', 'octopus', 'oyster', 'pancetta', 'pepperoni', 'pork',
    'prawn', 'rib', 'ribeye', 'salmon', 'sardine', 'sausage', 'scallop', 'seafood', 'shellfish', 'squid',
    'steak', 'tilapia', 'trout', 'tuna', 'turkey', 'veal', 'venison',
  ],
  'Dairy & Eggs': [
    'brie', 'butter', 'buttermilk', 'camembert', 'cheddar', 'cheese', 'colby',
    'cottage cheese', 'cream', 'crème fraîche', 'fraîche', 'egg', 'emmental', 'feta', 'ghee',
    'gouda', 'gruyere', 'half-and-half', 'halloumi', 'jack cheese', 'kefir', 'lard',
    'mascarpone', 'milk', 'almond milk', 'oat milk', 'oatly', 'soya milk', 'monterey', 'mozzarella', 'paneer', 'parmesan', 'pecorino',
    'provolone', 'quark', 'ricotta', 'stilton', 'yoghurt',
  ],
  Bakery: [
    'bagel', 'baguette', 'biscuit', 'bread', 'brioche', 'bun', 'ciabatta', 'croissant', 'crumpet',
    'flatbread', 'focaccia', 'muffin', 'naan', 'pain au chocolat', 'pita', 'pitta', 'pretzel', 'roll',
    'scone', 'sourdough', 'tortilla', 'waffle', 'wrap',
  ],
  Fruit: [
    'apple', 'apricot', 'banana', 'berry', 'blackberry', 'blackcurrant', 'blueberry',
    'cantaloupe', 'cherry', 'coconut', 'cranberry', 'currant', 'fig', 'fruit', 'gooseberry',
    'grape', 'grapefruit', 'guava', 'kiwi', 'lemon', 'lime', 'lychee', 'mango', 'melon',
    'nectarine', 'orange', 'papaya', 'passion fruit', 'peach', 'pear', 'pineapple', 'plum',
    'pomegranate', 'raspberry', 'redcurrant', 'strawberry', 'tangerine', 'watermelon',
  ],
  Beverages: [
    'beer', 'cider', 'coffee', 'cola', 'coke', 'cordial', 'dilute', 'espresso', 'gin',
    'ginger beer', 'hip pop', 'juice', 'kombucha', 'lemonade', 'prosecco', 'rum', 'seltzer',
    'smoothie', 'soda', 'sparkling water', 'spirits', 'sports drink', 'tea', 'tonic',
    'tonic water', 'vodka', 'water', 'whiskey', 'wine',
  ],
  Vegetables: [
    'artichoke', 'asparagus', 'aubergine', 'avocado', 'bean sprout', 'beetroot',
    'cherry tomato', 'bell pepper', 'broccoli', 'brussels sprout', 'cabbage', 'capsicum',
    'carrot', 'cauliflower', 'celeriac', 'celery', 'courgette', 'cress', 'cucumber', 'endive', 'fennel',
    'green bean', 'jalapeño', 'kale', 'leek', 'lettuce', 'mangetout', 'mushroom', 'okra',
    'onion', 'pak choi', 'parsnip', 'pea', 'pepper', 'potato', 'pumpkin', 'radish', 'rhubarb',
    'rocket', 'salad', 'shallot', 'spinach', 'spring onion', 'squash', 'swede', 'sweet potato',
    'sweetcorn', 'swiss chard', 'tomato', 'turnip', 'watercress', 'yam',
  ],
  'Herbs & Spices': [
    'allspice', 'anise', 'baharat', 'basil', 'bay leaf', 'black pepper', 'bay leaves', 'caraway', 'cardamom', 'cayenne',
    'chilli', 'chive', 'cinnamon', 'clove', 'coriander', 'cumin', 'curry', 'dill',
    'fennel seed', 'fenugreek', 'garlic', 'ginger', 'lemongrass', 'mace', 'marjoram', 'mint',
    'mustard seed', 'nutmeg', 'onion powder', 'oregano', 'paprika', 'parsley', 'peppercorn',
    'kaffir lime', 'lime leaf', 'lime leaves', 'curry leaf', 'curry leaves', 'masala',
    'ras el hanout', 'rosemary', 'saffron', 'sage', 'seasoning', 'spice', 'star anise', 'sumac', 'tarragon', 'thyme',
    'turmeric',
  ],
  Pantry: [
    'almond', 'arrowroot', 'baking', 'bean', 'bicarbonate', 'black bean', 'breadcrumb',
    'broth', 'brown rice', 'bulgur', 'chestnut', 'chicken stock', 'beef stock', 'vegetable stock',
    'fish stock', 'stock cube', 'coconut cream', 'conchiglie', 'couscous', 'farfalle', 'fettuccine',
    'fusilli', 'gnocchi', 'lasagne', 'linguine', 'macaroni', 'orecchiette', 'orzo', 'pappardelle',
    'pecan', 'quinoa', 'rigatoni', 'taco', 'tagliatelle', 'tinned tomato', 'yeast', 'brown sugar', 'capers', 'cashew', 'chickpea', 'chocolate', 'cocoa',
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
  pattern: RegExp;
  words: number;
  letters: number;
}

/**
 * Matches a keyword as a whole word, singular or plural ("berry", "berries";
 * "tomato", "tomatoes"), so it can't fire inside another word: "oil" in
 * "toilet", "ham" in "shampoo", "water" in "watercress", "butter" in
 * "butterflied".
 */
function keywordPattern(keyword: string): RegExp {
  const escaped = keyword.replace(/[-]/g, '\\-');
  const word = /[^aeiou]y$/.test(escaped) ? `${escaped.slice(0, -1)}(?:y|ies)` : `${escaped}(?:e?s)?`;
  return new RegExp(`(?:^|[^a-z])${word}(?![a-z])`);
}

const KEYWORDS: Keyword[] = Object.entries(CATEGORY_KEYWORDS).flatMap(([category, keywords]) =>
  keywords.map((keyword) => {
    const folded = foldDiacritics(keyword);
    return {
      category: category as ShoppingCategory,
      pattern: keywordPattern(folded),
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
