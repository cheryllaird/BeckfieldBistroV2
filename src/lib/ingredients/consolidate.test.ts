import { describe, expect, it } from 'vitest';
import { consolidateIngredients, mergeIntoShoppingList } from './consolidate';
import { makeIngredient, makePantryItem, makeShoppingItem } from '../../test/factories';
import type { ShoppingItem } from '../../types';

/** Drops the random id so consolidated output can be compared exactly. */
const withoutIds = (items: ShoppingItem[]) =>
  items.map((item) => {
    const rest: Partial<ShoppingItem> = { ...item };
    delete rest.id;
    return rest;
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
    expect(items[0].name).toBe('3 onions');
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
    const result = mergeIntoShoppingList([], [makeIngredient({ name: 'eggs', quantity: 2, unit: '' })], { scale: 1, mealEntryId: 'm1', recipeTitle: 'Omelette' });

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
      [makeIngredient({ name: 'extra virgin olive oil' }), makeIngredient({ name: 'garlic', unit: '' })], { scale: 1, mealEntryId: 'm1', recipeTitle: 'Pasta', pantryItems: pantry });
    expect(result.map((i) => i.name)).toEqual(['100 garlic']);
  });

  it('adds a second meal to an existing item and re-totals it', () => {
    const first = mergeIntoShoppingList([], [makeIngredient({ name: 'flour', quantity: 200 })], { scale: 1, mealEntryId: 'm1', recipeTitle: 'Cake' });
    const second = mergeIntoShoppingList(first, [makeIngredient({ name: 'flour', quantity: 300 })], { scale: 1, mealEntryId: 'm2', recipeTitle: 'Bread' });

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

    const result = mergeIntoShoppingList([legacy], [makeIngredient({ name: 'flour', quantity: 300 })], { scale: 1, mealEntryId: 'm2', recipeTitle: 'Bread' });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'legacy', name: '500 g flour', ingredientKey: 'flour' });
  });

  it('is idempotent for the same meal entry', () => {
    const once = mergeIntoShoppingList([], [makeIngredient({ name: 'flour', quantity: 200 })], { scale: 1, mealEntryId: 'm1', recipeTitle: 'Cake' });
    const twice = mergeIntoShoppingList(once, [makeIngredient({ name: 'flour', quantity: 200 })], { scale: 1, mealEntryId: 'm1', recipeTitle: 'Cake' });
    expect(twice).toEqual(once);
  });

  it('applies the scale factor', () => {
    const result = mergeIntoShoppingList([], [makeIngredient({ name: 'rice', quantity: 150 })], { scale: 2 });
    expect(result[0].name).toBe('300 g rice');
    expect(result[0].mealSources).toBeUndefined();
  });

  it('does not duplicate a manually-added item with identical text', () => {
    const manual = makeShoppingItem({ id: 'manual', name: '100 g flour', manual: true });
    const result = mergeIntoShoppingList([manual], [makeIngredient({ name: 'flour', quantity: 100 })], { scale: 1 });
    expect(result).toEqual([manual]);
  });

  it('does not mutate the existing list', () => {
    const existing: ShoppingItem[] = [];
    mergeIntoShoppingList(existing, [makeIngredient()], { scale: 1 });
    expect(existing).toEqual([]);
  });
});

describe('consolidation of real recipe lines', () => {
  const meal = (name: string, quantity: number, unit = '', servings = 1, originalServings = 1) => ({
    ingredients: [makeIngredient({ name, quantity, unit })],
    servings,
    originalServings,
  });

  it('buys the first option when a recipe offers an alternative', () => {
    const items = consolidateIngredients([meal('Shallots', 2), meal('Shallots, or red onion', 1)]);
    expect(items.map((i) => i.name)).toEqual(['3 shallots']);
  });

  it('ignores how a recipe wants things cut, and rounds whole items up', () => {
    const items = consolidateIngredients([
      meal('spring onions', 4, '', 6, 4.5), // scales to 5 ⅓
      meal('spring onions, thin strips', 3),
    ]);
    expect(items.map((i) => i.name)).toEqual(['9 spring onions']);
  });

  it('names US ingredients the UK way and merges them with their UK twins', () => {
    const items = consolidateIngredients([
      meal('fresh cilantro leaves', 1, 'handful'),
      meal('Coriander, roughly chopped', 1, 'handful'),
      meal('heavy cream', 150, 'ml'),
      meal('double cream', 0.1, 'l'),
    ]);
    expect(items.map((i) => i.name).sort()).toEqual(['2 handfuls coriander', '250 ml double cream']);
  });

  it('picks the spelling that suits the total', () => {
    expect(consolidateIngredients([meal('onions', 1), meal('onion', 0.5)])[0].name).toBe('2 onions');
    expect(consolidateIngredients([meal('lemons', 1), meal('lemon', 1, '')])[0].name).toBe('2 lemons');
    expect(consolidateIngredients([meal('lemons', 0.5), meal('lemon', 0.5)])[0].name).toBe('1 lemon');
  });

  it('reads a count written into the name when the quantity is missing', () => {
    const items = consolidateIngredients([meal('2 shallots, thinly sliced', 0), meal('shallot', 1)]);
    expect(items.map((i) => i.name)).toEqual(['3 shallots']);
  });

  it('categorises by the UK name', () => {
    expect(consolidateIngredients([meal('cilantro', 1)])[0].category).toBe('Herbs & Spices');
  });
});

describe('mergeIntoShoppingList with repeated ingredients', () => {
  it('counts every line of a recipe that names the same ingredient', () => {
    const result = mergeIntoShoppingList(
      [],
      [
        makeIngredient({ name: 'lemon', quantity: 1, unit: '' }),
        makeIngredient({ name: 'juice of 1 lemon', quantity: 1, unit: '' }),
      ], { scale: 1, mealEntryId: 'm1', recipeTitle: 'Lemon Tart' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('2 lemon');
    expect(result[0].mealSources).toHaveLength(2);
  });

  it('merges an alternative-laden line into the item already on the list', () => {
    const first = mergeIntoShoppingList([], [makeIngredient({ name: 'shallots', quantity: 2, unit: '' })], { scale: 1, mealEntryId: 'm1', recipeTitle: 'Stew' });
    const second = mergeIntoShoppingList(
      first,
      [makeIngredient({ name: 'Shallots, or red onion', quantity: 1, unit: '' })], { scale: 1, mealEntryId: 'm2', recipeTitle: 'Curry' });
    expect(second).toHaveLength(1);
    expect(second[0].name).toBe('3 shallots');
  });
});

describe('recipe text versus list text', () => {
  const recipeLines = [
    makeIngredient({ name: 'spring onions, thin strips', quantity: 3, unit: '' }),
    makeIngredient({ name: 'onion, finely chopped', quantity: 1, unit: '' }),
    makeIngredient({ name: 'sliced mushrooms', quantity: 200, unit: 'g' }),
    makeIngredient({ name: 'potatoes, peeled and mashed', quantity: 500, unit: 'g' }),
  ];
  const asWritten = recipeLines.map((line) => ({ ...line }));

  it('lists the plain ingredient, without the prep notes', () => {
    const generated = consolidateIngredients([{ ingredients: recipeLines, servings: 1, originalServings: 1, mealEntryId: 'm1', recipeTitle: 'Stir-fry' }]);
    const merged = mergeIntoShoppingList([], recipeLines, { scale: 1, mealEntryId: 'm1', recipeTitle: 'Stir-fry' });
    for (const items of [generated, merged]) {
      expect(items.map((i) => i.name).sort()).toEqual(['1 onion', '200 g mushrooms', '3 spring onions', '500 g potatoes']);
    }
  });

  it('leaves the recipe as written, and keeps that text in the meal breakdown', () => {
    const items = consolidateIngredients([{ ingredients: recipeLines, servings: 2, originalServings: 1, mealEntryId: 'm1', recipeTitle: 'Stir-fry' }]);
    mergeIntoShoppingList([], recipeLines, { scale: 2, mealEntryId: 'm1', recipeTitle: 'Stir-fry' });
    expect(recipeLines).toEqual(asWritten);
    const springOnions = items.find((i) => i.ingredientKey === 'spring onion');
    expect(springOnions?.mealSources?.[0].ingredientName).toBe('spring onions, thin strips');
  });
});

describe('remembered categories', () => {
  const overrides = { 'rice noodle': 'Other', tofu: 'Dairy & Eggs' } as const;

  it('files generated items where the household put them before', () => {
    const items = consolidateIngredients(
      [{ ingredients: [makeIngredient({ name: 'Rice noodles' }), makeIngredient({ name: 'flour' })], servings: 1, originalServings: 1 }],
      overrides,
    );
    expect(Object.fromEntries(items.map((i) => [i.ingredientKey, i.category]))).toEqual({ 'rice noodle': 'Other', flour: 'Pantry' });
  });

  it('files items added from a meal the same way', () => {
    const result = mergeIntoShoppingList([], [makeIngredient({ name: 'firm tofu, cubed', unit: 'g' })], { categoryOverrides: { 'firm tofu': 'Dairy & Eggs' } });
    expect(result[0].category).toBe('Dairy & Eggs');
  });
});
