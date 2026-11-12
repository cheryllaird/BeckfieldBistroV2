import { describe, expect, it } from 'vitest';
import { formatQuantity, leadingCount, normalizeUnit, parseTypedAmount } from './amounts';

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
    [0.66, '⅔'], // summed thirds still read as a fraction
    [2.67, '2 ⅔'],
    [1.99, '2'],
    [0.1, '0.1'],
  ])('%d → %j', (quantity, expected) => {
    expect(formatQuantity(quantity)).toBe(expected);
  });
});

describe('leadingCount', () => {
  it.each([
    ['2 shallots', 2],
    ['½ red onion', 0.5],
    ['1/2 lemon', 0.5],
    ['400g chopped tomatoes', 0],
    ['2 tbsp oil', 0],
    ['00 flour', 0],
    ['shallots', 0],
  ])('%j → %d', (name, expected) => {
    expect(leadingCount(name)).toBe(expected);
  });
});

describe('parseTypedAmount', () => {
  it.each([
    ['100 g flour', 'flour', 100, 'g'],
    ['100g flour', 'flour', 100, 'g'],
    ['100grams flour', 'flour', 100, 'grams'],
    ['100 g. flour', 'flour', 100, 'g'],
    ['1.5 kg potatoes', 'potatoes', 1.5, 'kg'],
    ['½ lemon', 'lemon', 0.5, ''],
    ['2 lemons', 'lemons', 2, ''],
    ['100 garlic', 'garlic', 100, ''],
    ['flour 100g', 'flour', 100, 'g'],
    ['flour 100 grams', 'flour', 100, 'grams'],
    ['flour - 100 g', 'flour', 100, 'g'],
    ['Flour, 100 grams', 'flour', 100, 'grams'],
    ['lemons x2', 'lemons', 2, ''],
    ['eggs 6', 'eggs', 6, ''],
  ])('reads "%s" as %s, %s %s', (text, name, quantity, unit) => {
    expect(parseTypedAmount(text)).toEqual({ name, amount: { quantity, unit } });
  });

  it.each(['flour', '00 flour', '7up', 'a handful of coriander', 'flour (1 bag)', 'tomatoes 2 400g', ''])(
    'reads no amount in "%s"',
    (text) => {
      expect(parseTypedAmount(text)).toBeUndefined();
    },
  );
});
