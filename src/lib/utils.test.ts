import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canonicalizeIngredientName,
  categorize,
  consolidateIngredients,
  findPantryMatch,
  formatDayLabel,
  formatQuantity,
  formatTime,
  getRecipeIngredients,
  getWeekDays,
  isoDate,
  matchesPantryName,
  mergeIntoShoppingList,
  normalizeIngredientName,
  normalizeUnit,
  recipeSourceLabel,
  scaleIngredient,
  stripLeadingAmount,
} from './utils';
import { makeIngredient, makePantryItem, makeShoppingItem } from '../test/factories';
import type { ShoppingItem } from '../types';

/** Drops the random id so consolidated output can be compared exactly. */
const withoutIds = (items: ShoppingItem[]) =>
  items.map((item) => {
    const rest: Partial<ShoppingItem> = { ...item };
    delete rest.id;
    return rest;
  });

describe('normalizeUnit', () => {
  it.each([
    ['grams', 'g'],
    ['Kilograms', 'kg'],
    ['lbs', 'lb'],
    ['millilitres', 'ml'],
    ['Tablespoons', 'tbsp'],
    ['teaspoon', 'tsp'],
    ['cups', 'cup'],
    ['cloves', ''],
    ['pieces', ''],
    [' tin ', 'tin'],
    ['cans', 'can'],
    ['handfuls', 'handful'],
  ])('%j → %j', (input, expected) => {
    expect(normalizeUnit(input)).toBe(expected);
  });

  it('does not treat Object.prototype keys as units', () => {
    expect(normalizeUnit('constructor')).toBe('constructor');
  });
});

describe('canonicalizeIngredientName', () => {
  it.each([
    // Prep instructions after a comma are dropped...
    ['Broccoli, cut into florets', 'broccoli'],
    ['onion, finely chopped', 'onion'],
    ['salt, to taste', 'salt'],
    ['butter, at room temperature', 'butter'],
    ['flour, plus extra for dusting', 'flour'],
    // ...but clauses that name the ingredient survive
    ['flour, self-raising', 'flour, self-raising'],
    ['chicken thighs, bone-in', 'chicken thighs, bone-in'],
    ['almonds, ground', 'almonds, ground'],
    // "minced" names the product for meats sold as mince, and is prep otherwise
    ['minced beef', 'minced beef'],
    ['minced garlic', 'garlic'],
    ['beef, minced', 'beef, minced'],
    ['garlic, minced', 'garlic'],
    // "ground" names the product unless a modifier makes it a step
    ['ground almonds', 'ground almonds'],
    ['freshly ground black pepper', 'black pepper'],
    // Leading prep descriptors
    ['finely chopped parsley', 'parsley'],
    ['diced onion', 'onion'],
    // Juice consolidates with the whole fruit
    ['juice of 2 lemons', 'lemon'],
    ['lemon juice', 'lemon'],
    ['limes juice', 'lime'],
    // Portioning words
    ['garlic cloves', 'garlic'],
    ['basil leaves', 'basil'],
    ['lemon wedges', 'lemon'],
    // Quality modifiers
    ['extra virgin olive oil', 'olive oil'],
    ['flat-leaf parsley', 'parsley'],
    // US → UK synonyms
    ['cilantro', 'coriander'],
    ['zucchini', 'courgette'],
    ['eggplant', 'aubergine'],
    ['scallion', 'spring onion'],
    ['scallions', 'spring onions'],
    ['green onion', 'spring onion'],
    ['green onions', 'spring onions'],
    ['zucchinis', 'courgettes'],
    ['eggplants', 'aubergines'],
    ['2 large eggplants', '2 large aubergines'],
    ['arugula', 'rocket'],
  ])('%j → %j', (input, expected) => {
    expect(canonicalizeIngredientName(input)).toBe(expected);
  });
});


describe('normalizeIngredientName', () => {
  it.each([
    ['scallions', 'spring onions'],
    ['green onions', 'spring onion'],
    ['zucchinis', 'courgette'],
    ['eggplants', 'aubergine'],
  ])('gives %j the same key as %j', (us, uk) => {
    expect(normalizeIngredientName(us)).toBe(normalizeIngredientName(uk));
  });

  it.each([
    ['tomatoes', 'tomato'],
    ['cherries', 'cherry'],
    ['carrots', 'carrot'],
    ['Garlic Cloves', 'garlic'],
    ['hummus', 'hummus'],
    ['swiss', 'swiss'],
    ['couscous', 'couscous'],
  ])('%j → %j', (input, expected) => {
    expect(normalizeIngredientName(input)).toBe(expected);
  });
});

describe('stripLeadingAmount', () => {
  it.each([
    ['2 tsp sea salt', 'sea salt'],
    ['½ cup milk', 'milk'],
    ['1-2 tbsp. olive oil', 'olive oil'],
    ['400g chopped tomatoes', 'chopped tomatoes'],
    ['salt', 'salt'],
  ])('%j → %j', (input, expected) => {
    expect(stripLeadingAmount(input)).toBe(expected);
  });

  it('keeps the original text if stripping would leave nothing', () => {
    expect(stripLeadingAmount('  2 cups ')).toBe('2 cups');
  });
});

describe('matchesPantryName', () => {
  it.each([
    ['salt', 'salt'],
    ['2 tsp sea salt flakes', 'salt'],
    ['freshly ground black pepper', 'black pepper'],
    ['sunflower oil', 'oil'],
    ['light olive oil', 'olive oil'],
    ['salt', 'sea salt'],
    ['caster sugar', 'sugar'],
    ['cloves garlic', 'garlic'],
  ])('ingredient %j is covered by cupboard %j', (ingredient, pantry) => {
    expect(matchesPantryName(ingredient, pantry)).toBe(true);
  });

  it.each([
    ['bell pepper', 'pepper'],
    ['peanut butter', 'butter'],
    ['spring onion', 'onion'],
    ['coconut cream', 'cream'],
    ['olive oil', 'salt'],
  ])('ingredient %j is NOT covered by cupboard %j', (ingredient, pantry) => {
    expect(matchesPantryName(ingredient, pantry)).toBe(false);
  });

  it('never matches empty names', () => {
    expect(matchesPantryName('', 'salt')).toBe(false);
    expect(matchesPantryName('salt', '')).toBe(false);
  });
});

describe('findPantryMatch', () => {
  const pantry = [
    makePantryItem({ id: 'p-salt', name: 'salt', normalizedName: 'salt' }),
    makePantryItem({ id: 'p-oil', name: 'olive oil', normalizedName: 'olive oil' }),
  ];

  it('returns the covering cupboard item', () => {
    expect(findPantryMatch('extra virgin olive oil', pantry)?.id).toBe('p-oil');
  });

  it('returns undefined when nothing covers the ingredient', () => {
    expect(findPantryMatch('chicken', pantry)).toBeUndefined();
  });
});

describe('formatTime', () => {
  it.each([
    [0, '0 min'],
    [45, '45 min'],
    [60, '1h'],
    [90, '1h 30m'],
    [135, '2h 15m'],
  ])('%i → %j', (minutes, expected) => {
    expect(formatTime(minutes)).toBe(expected);
  });
});

describe('formatQuantity', () => {
  it.each([
    [2, '2'],
    [0.5, '½'],
    [0.25, '¼'],
    [0.75, '¾'],
    [1.5, '1 ½'],
    [2.25, '2 ¼'],
    [0.125, '⅛'],
    [0.33, '⅓'],
    [1.2, '1.2'],
  ])('%d → %j', (quantity, expected) => {
    expect(formatQuantity(quantity)).toBe(expected);
  });
});

describe('scaleIngredient', () => {
  it('scales the quantity by the servings ratio', () => {
    const scaled = scaleIngredient(makeIngredient({ quantity: 200 }), 4, 6);
    expect(scaled.quantity).toBe(300);
  });

  it('rounds to two decimal places', () => {
    expect(scaleIngredient(makeIngredient({ quantity: 1 }), 3, 1).quantity).toBe(0.33);
  });

  it('does not mutate the input', () => {
    const ing = makeIngredient({ quantity: 100 });
    scaleIngredient(ing, 1, 2);
    expect(ing.quantity).toBe(100);
  });
});

describe('getRecipeIngredients', () => {
  const flat = [makeIngredient({ name: 'flat' })];

  it('prefers ingredient sections when present', () => {
    const recipe = {
      ingredients: flat,
      ingredientSections: [
        { title: 'Base', ingredients: [makeIngredient({ name: 'a' })] },
        { title: 'Topping', ingredients: [makeIngredient({ name: 'b' })] },
      ],
    };
    expect(getRecipeIngredients(recipe).map((i) => i.name)).toEqual(['a', 'b']);
  });

  it('falls back to the flat list when there are no sections', () => {
    expect(getRecipeIngredients({ ingredients: flat })).toBe(flat);
    expect(getRecipeIngredients({ ingredients: flat, ingredientSections: [] })).toBe(flat);
  });
});

describe('categorize', () => {
  it.each([
    ['carrots', 'Vegetables'],
    ['chicken breast', 'Meat & Seafood'],
    ['cheddar', 'Dairy & Eggs'],
    ['sourdough loaf', 'Bakery'],
    ['frozen peas', 'Frozen'],
    ['basmati rice', 'Pantry'],
    ['fresh basil', 'Herbs & Spices'],
    ['sparkling water', 'Beverages'],
    ['kitchen roll', 'Bakery'], // "roll" is a bakery keyword
    ['washing up liquid', 'Other'],
  ])('%j → %j', (name, expected) => {
    expect(categorize(name)).toBe(expected);
  });

  it('prefers multi-word keywords over single words', () => {
    expect(categorize('cherry tomatoes')).toBe('Vegetables'); // not Fruit via "cherry"
    expect(categorize('coconut milk')).toBe('Pantry'); // not Dairy via "milk"
    expect(categorize('peanut butter')).toBe('Pantry'); // not Dairy via "butter"
    expect(categorize('black pepper')).toBe('Herbs & Spices'); // not Vegetables via "pepper"
  });

  it('is case-insensitive', () => {
    expect(categorize('SALMON FILLET')).toBe('Meat & Seafood');
  });
});

describe('consolidateIngredients', () => {
  it('merges the same ingredient across recipes', () => {
    const items = consolidateIngredients([
      { ingredients: [makeIngredient({ name: 'flour', quantity: 200, unit: 'g' })], servings: 4, originalServings: 4 },
      { ingredients: [makeIngredient({ name: 'Flour', quantity: 300, unit: 'grams' })], servings: 4, originalServings: 4 },
    ]);

    expect(withoutIds(items)).toEqual([
      {
        name: '500 g flour',
        category: 'Pantry',
        checked: false,
        mealSources: undefined,
        ingredientKey: 'flour',
      },
    ]);
  });

  it('sums convertible units into the finest unit present', () => {
    const items = consolidateIngredients([
      { ingredients: [makeIngredient({ name: 'sugar', quantity: 1, unit: 'kg' })], servings: 1, originalServings: 1 },
      { ingredients: [makeIngredient({ name: 'sugar', quantity: 500, unit: 'g' })], servings: 1, originalServings: 1 },
    ]);
    expect(items.map((i) => i.name)).toEqual(['1500 g sugar']);
  });

  it('keeps a whole lemon and its juice on one line', () => {
    const items = consolidateIngredients([
      {
        ingredients: [
          makeIngredient({ name: 'lemon', quantity: 1, unit: '' }),
          makeIngredient({ name: 'lemon juice', quantity: 2, unit: 'tbsp' }),
        ],
        servings: 1,
        originalServings: 1,
      },
    ]);
    expect(items.map((i) => i.name)).toEqual(['1 lemon (+ 2 tbsp)']);
  });

  it('scales each group by its planned servings', () => {
    const items = consolidateIngredients([
      { ingredients: [makeIngredient({ name: 'milk', quantity: 100, unit: 'ml' })], servings: 8, originalServings: 4 },
    ]);
    expect(items[0].name).toBe('200 ml milk');
  });

  it('brackets amounts from different unit families instead of splitting the item', () => {
    const items = consolidateIngredients([
      {
        ingredients: [
          makeIngredient({ name: 'butter', quantity: 50, unit: 'g' }),
          makeIngredient({ name: 'butter', quantity: 1, unit: 'tbsp' }),
        ],
        servings: 1,
        originalServings: 1,
      },
    ]);
    expect(items.map((i) => i.name)).toEqual(['50 g butter (+ 1 tbsp)']);
  });

  it('records which meals contributed to each item', () => {
    const items = consolidateIngredients([
      {
        ingredients: [makeIngredient({ name: 'onion', quantity: 1, unit: '' })],
        servings: 2,
        originalServings: 2,
        mealEntryId: 'm1',
        recipeTitle: 'Soup',
      },
      {
        ingredients: [makeIngredient({ name: 'onions', quantity: 2, unit: '' })],
        servings: 2,
        originalServings: 2,
        mealEntryId: 'm2',
        recipeTitle: 'Stew',
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('3 onion');
    expect(items[0].mealSources?.map((s) => s.recipeTitle)).toEqual(['Soup', 'Stew']);
  });

  it('merges US and UK names for the same ingredient, plural or not', () => {
    const items = consolidateIngredients([
      { ingredients: [makeIngredient({ name: 'scallions', quantity: 2, unit: '' })], servings: 1, originalServings: 1 },
      { ingredients: [makeIngredient({ name: 'spring onion', quantity: 1, unit: '' })], servings: 1, originalServings: 1 },
    ]);
    expect(items.map((i) => i.name)).toEqual(['3 spring onions']);
  });

  it('omits a zero quantity from the display name', () => {
    const items = consolidateIngredients([
      { ingredients: [makeIngredient({ name: 'salt', quantity: 0, unit: '' })], servings: 1, originalServings: 1 },
    ]);
    expect(items[0].name).toBe('salt');
  });

  it('sorts output by category', () => {
    const items = consolidateIngredients([
      {
        ingredients: [
          makeIngredient({ name: 'rice' }),
          makeIngredient({ name: 'carrot' }),
          makeIngredient({ name: 'chicken' }),
        ],
        servings: 1,
        originalServings: 1,
      },
    ]);
    expect(items.map((i) => i.category)).toEqual(['Meat & Seafood', 'Pantry', 'Vegetables']);
  });
});

describe('mergeIntoShoppingList', () => {
  it('adds new ingredients with a meal source', () => {
    const result = mergeIntoShoppingList([], [makeIngredient({ name: 'eggs', quantity: 2, unit: '' })], 1, 'm1', 'Omelette');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: '2 eggs',
      category: 'Dairy & Eggs',
      checked: false,
      ingredientKey: 'egg',
      mealSources: [{ mealEntryId: 'm1', recipeTitle: 'Omelette', scaledQuantity: 2 }],
    });
  });

  it('skips anything already in the store cupboard', () => {
    const pantry = [makePantryItem({ normalizedName: 'olive oil' })];
    const result = mergeIntoShoppingList(
      [],
      [makeIngredient({ name: 'extra virgin olive oil' }), makeIngredient({ name: 'garlic', unit: '' })],
      1,
      'm1',
      'Pasta',
      pantry,
    );
    expect(result.map((i) => i.name)).toEqual(['100 garlic']);
  });

  it('adds a second meal to an existing item and re-totals it', () => {
    const first = mergeIntoShoppingList([], [makeIngredient({ name: 'flour', quantity: 200 })], 1, 'm1', 'Cake');
    const second = mergeIntoShoppingList(first, [makeIngredient({ name: 'flour', quantity: 300 })], 1, 'm2', 'Bread');

    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
    expect(second[0].name).toBe('500 g flour');
    expect(second[0].mealSources).toHaveLength(2);
  });

  it('still matches items saved with the older name__unit key', () => {
    const legacy = makeShoppingItem({
      id: 'legacy',
      name: '200 g flour',
      ingredientKey: 'flour__g',
      mealSources: [{ mealEntryId: 'm1', recipeTitle: 'Cake', scaledQuantity: 200, unit: 'g', ingredientName: 'flour' }],
    });

    const result = mergeIntoShoppingList([legacy], [makeIngredient({ name: 'flour', quantity: 300 })], 1, 'm2', 'Bread');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'legacy', name: '500 g flour', ingredientKey: 'flour' });
  });

  it('is idempotent for the same meal entry', () => {
    const once = mergeIntoShoppingList([], [makeIngredient({ name: 'flour', quantity: 200 })], 1, 'm1', 'Cake');
    const twice = mergeIntoShoppingList(once, [makeIngredient({ name: 'flour', quantity: 200 })], 1, 'm1', 'Cake');
    expect(twice).toEqual(once);
  });

  it('applies the scale factor', () => {
    const result = mergeIntoShoppingList([], [makeIngredient({ name: 'rice', quantity: 150 })], 2);
    expect(result[0].name).toBe('300 g rice');
    expect(result[0].mealSources).toBeUndefined();
  });

  it('does not duplicate a manually-added item with identical text', () => {
    const manual = makeShoppingItem({ id: 'manual', name: '100 g flour', manual: true });
    const result = mergeIntoShoppingList([manual], [makeIngredient({ name: 'flour', quantity: 100 })], 1);
    expect(result).toEqual([manual]);
  });

  it('does not mutate the existing list', () => {
    const existing: ShoppingItem[] = [];
    mergeIntoShoppingList(existing, [makeIngredient()], 1);
    expect(existing).toEqual([]);
  });
});

describe('date helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('isoDate formats the local calendar date', () => {
    expect(isoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(isoDate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('getWeekDays returns Monday to Sunday of the current week', () => {
    vi.useFakeTimers({ now: new Date(2026, 2, 18, 15, 30) }); // Wednesday

    const days = getWeekDays();

    expect(days.map(isoDate)).toEqual([
      '2026-03-16',
      '2026-03-17',
      '2026-03-18',
      '2026-03-19',
      '2026-03-20',
      '2026-03-21',
      '2026-03-22',
    ]);
    expect(days[0].getHours()).toBe(0);
  });

  it('getWeekDays treats Sunday as the end of the week, not the start', () => {
    vi.useFakeTimers({ now: new Date(2026, 2, 22, 9) }); // Sunday

    expect(isoDate(getWeekDays()[0])).toBe('2026-03-16');
  });

  it('getWeekDays offsets by whole weeks', () => {
    vi.useFakeTimers({ now: new Date(2026, 2, 18) });

    expect(isoDate(getWeekDays(1)[0])).toBe('2026-03-23');
    expect(isoDate(getWeekDays(-1)[0])).toBe('2026-03-09');
  });

  it('getWeekDays crosses month boundaries', () => {
    vi.useFakeTimers({ now: new Date(2026, 3, 1) }); // Wednesday 1 April

    expect(getWeekDays().map(isoDate)[0]).toBe('2026-03-30');
    expect(getWeekDays().map(isoDate)[6]).toBe('2026-04-05');
  });

  it('formatDayLabel produces en-GB labels and flags today', () => {
    vi.useFakeTimers({ now: new Date(2026, 2, 18, 12) });

    expect(formatDayLabel(new Date(2026, 2, 18))).toEqual({
      weekday: 'Wed',
      monthDay: '18 Mar',
      isToday: true,
    });
    expect(formatDayLabel(new Date(2026, 2, 19)).isToday).toBe(false);
  });
});

describe('recipeSourceLabel', () => {
  it('uses the source when it is set', () => {
    expect(recipeSourceLabel({ source: 'Ottolenghi', sourceUrl: 'https://example.com' })).toBe('Ottolenghi');
  });

  it('falls back to the URL host (without www.) for an unknown source', () => {
    expect(recipeSourceLabel({ source: 'Unknown', sourceUrl: 'https://www.bbcgoodfood.com/recipes/x' })).toBe(
      'bbcgoodfood.com',
    );
    expect(recipeSourceLabel({ source: '  ', sourceUrl: 'https://example.org/a' })).toBe('example.org');
  });

  it('survives a malformed URL', () => {
    expect(recipeSourceLabel({ source: 'unknown', sourceUrl: 'not a url' })).toBe('unknown');
    expect(recipeSourceLabel({ source: '', sourceUrl: 'not a url' })).toBe('Unknown');
  });
});
