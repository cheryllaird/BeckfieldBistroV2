import { describe, expect, it } from 'vitest';
import { categorize } from './categorize';
import { categoryRank } from './categoryOrder';
import { defaultShelf, shelfOf } from './shelves';
import type { PantryShelf } from '../../types';

const CASES: [string, PantryShelf][] = [
  ['olive oil', 'Oils & Vinegars'],
  ['extra-virgin olive oil', 'Oils & Vinegars'],
  ['sesame oil', 'Oils & Vinegars'],
  ['balsamic vinegar', 'Oils & Vinegars'],
  ['soy sauce', 'Condiments & Sauces'],
  ['mayonnaise', 'Condiments & Sauces'],
  ['capers', 'Condiments & Sauces'],
  ['olives', 'Tins & Jars'],
  ['spaghetti', 'Pasta, Rice & Grains'],
  ['basmati rice', 'Pasta, Rice & Grains'],
  ['rice noodles', 'Pasta, Rice & Grains'],
  ['tinned tomatoes', 'Tins & Jars'],
  ['chickpeas', 'Tins & Jars'],
  ['coconut milk', 'Tins & Jars'],
  ['plain flour', 'Baking'],
  ['caster sugar', 'Baking'],
  ['vanilla extract', 'Baking'],
  ['dark chocolate', 'Baking'],
  ['cashews', 'Nuts, Seeds & Dried Fruit'],
  ['dried apricots', 'Nuts, Seeds & Dried Fruit'],
  ['honey', 'Spreads & Syrups'],
  ['peanut butter', 'Spreads & Syrups'],
  ['stock cube', 'Other pantry'],
];

describe('shelfOf', () => {
  it.each(CASES)('%s → %s', (name, shelf) => {
    expect(shelfOf(name)).toBe(shelf);
  });

  it('shelves are a Pantry-only idea: categories from categorize() are untouched', () => {
    // "dried apricots" is filed under Fruit; the shelf is simply never shown for it.
    expect(categorize('dried apricots')).toBe('Fruit');
    expect(categorize('olive oil')).toBe('Pantry');
    expect(categorize('milk')).toBe('Dairy & Eggs');
  });

  it('a household choice wins, keyed like category choices', () => {
    expect(shelfOf('200 g capers', { caper: 'Tins & Jars' })).toBe('Tins & Jars');
    expect(defaultShelf('200 g capers')).toBe('Condiments & Sauces');
  });

  it('does not match inside other words', () => {
    expect(defaultShelf('toilet oilcloth')).toBe('Other pantry');
  });
});

describe('categoryRank', () => {
  it('follows the aisle order and puts unknown categories last', () => {
    expect(categoryRank('Vegetables')).toBeLessThan(categoryRank('Pantry'));
    expect(categoryRank('Mystery')).toBeGreaterThan(categoryRank('Other'));
  });
});
