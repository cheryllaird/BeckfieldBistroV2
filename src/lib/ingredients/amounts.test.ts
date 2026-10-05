import { describe, expect, it } from 'vitest';
import { formatQuantity, leadingCount, normalizeUnit } from './amounts';

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
