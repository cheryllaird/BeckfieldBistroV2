import { describe, expect, it } from 'vitest';
import { categorize } from './categorize';

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

describe('categorize with UK names and whole words', () => {
  it.each([
    ['cilantro', 'Herbs & Spices'],
    ['zucchini', 'Vegetables'],
    ['shrimp', 'Meat & Seafood'],
    ['jalapeno', 'Vegetables'],
    ['kaffir lime leaves', 'Herbs & Spices'],
    ['chopped tomatoes', 'Pantry'],
    ['steak', 'Meat & Seafood'], // not Beverages via "tea"
    ['aubergine', 'Vegetables'], // not Beverages via "gin"
  ])('%j → %j', (name, expected) => {
    expect(categorize(name)).toBe(expected);
  });
});
