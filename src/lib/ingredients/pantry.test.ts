import { describe, expect, it } from 'vitest';
import {
  findPantryMatch,
  isOnShoppingList,
  matchesPantryName,
  shoppingItemFromPantry,
  stripLeadingAmount,
} from './pantry';
import { makePantryItem, makeShoppingItem } from '../../test/factories';

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

describe('out-of-stock cupboard items', () => {
  const salt = makePantryItem({ normalizedName: 'salt' });

  it('are not matched, so their ingredients are bought again', () => {
    expect(findPantryMatch('sea salt', [{ ...salt, inStock: false }])).toBeUndefined();
  });

  it('count as in stock when the field is missing or true', () => {
    expect(findPantryMatch('sea salt', [salt])).toBe(salt);
    const explicit = { ...salt, inStock: true };
    expect(findPantryMatch('sea salt', [explicit])).toBe(explicit);
  });
});

describe('shoppingItemFromPantry', () => {
  it('builds an unticked manual item with the cupboard name and category', () => {
    const item = shoppingItemFromPantry(makePantryItem({ name: 'cumin', category: 'Herbs & Spices' }), 'stock-up');
    expect(item).toMatchObject({ name: 'cumin', category: 'Herbs & Spices', listType: 'stock-up', checked: false, manual: true });
    expect(item.id).toBeTruthy();
  });
});

describe('isOnShoppingList', () => {
  const salt = makePantryItem({ normalizedName: 'salt' });

  it('matches an unticked item on either list, ignoring amounts and case', () => {
    expect(isOnShoppingList(salt, [makeShoppingItem({ name: '1 tsp Salt', listType: 'stock-up' })])).toBe(true);
  });

  it('ignores ticked items and other ingredients', () => {
    expect(isOnShoppingList(salt, [makeShoppingItem({ name: 'salt', checked: true })])).toBe(false);
    expect(isOnShoppingList(salt, [makeShoppingItem({ name: 'salted butter' })])).toBe(false);
  });
});
