import { describe, expect, it } from 'vitest';
import { findPantryMatch, matchesPantryName, splitByPantry, stripLeadingAmount } from './pantry';
import { makeIngredient, makePantryItem } from '../../test/factories';

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

describe('splitByPantry', () => {
  const salt = makePantryItem({ name: 'salt', normalizedName: 'salt' });
  const flakes = makeIngredient({ name: 'sea salt flakes' });
  const flour = makeIngredient({ name: 'flour' });

  it('separates what the cupboard covers, naming the cupboard item that covered it', () => {
    const { toBuy, skipped } = splitByPantry([flakes, flour], [salt]);

    expect(toBuy).toEqual([flour]);
    expect(skipped).toEqual([{ key: expect.any(String), ingredient: flakes, pantryItem: salt }]);
  });

  it('buys a kept ingredient anyway but still reports it as skipped', () => {
    const { skipped } = splitByPantry([flakes], [salt]);
    const { toBuy, skipped: again } = splitByPantry([flakes], [salt], new Set([skipped[0].key]));

    expect(toBuy).toEqual([flakes]);
    expect(again).toHaveLength(1);
  });

  it('skips nothing when the cupboard is empty', () => {
    expect(splitByPantry([flakes, flour], [])).toEqual({ toBuy: [flakes, flour], skipped: [] });
  });
});
