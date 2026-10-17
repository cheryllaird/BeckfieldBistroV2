import { describe, expect, it } from 'vitest';
import { categorize } from './categorize';
import { categoryKey, itemCategoryKey } from './categoryOverrides';

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

describe('categorize with remembered choices', () => {
  const overrides = { 'rice noodle': 'Other' } as const;

  it('uses the remembered aisle whatever the amount, number or prep', () => {
    expect(categorize('rice noodles', overrides)).toBe('Other');
    expect(categorize('200 g rice noodles', overrides)).toBe('Other');
    expect(categorize('Rice noodle, soaked', overrides)).toBe('Other');
  });

  it('falls back to the keyword tables for everything else', () => {
    expect(categorize('egg noodles', overrides)).toBe('Pantry');
  });

  it('keys typed text and list items the same way', () => {
    expect(categoryKey('2 tins chickpeas')).toBe('chickpea');
    expect(itemCategoryKey({ name: '400 g flour', ingredientKey: 'flour__g' })).toBe('flour');
    expect(itemCategoryKey({ name: 'Cilantro' })).toBe('coriander');
  });
});

describe('categorize matches whole words, singular or plural', () => {
  it.each([
    // A keyword inside another word no longer counts
    ['watercress', 'Vegetables'], // not Beverages via "water"
    ['butterflied chicken thighs', 'Meat & Seafood'], // not Dairy via "butter"
    ['extra virgin olive oil', 'Pantry'], // not Beverages via "gin"
    ['toilet roll', 'Bakery'], // "roll" still counts; "oil" in "toilet" doesn't
    ['shampoo', 'Other'], // not Meat via "ham"
    // Plurals, including -ies
    ['blackberries', 'Fruit'],
    ['strawberries', 'Fruit'],
    ['peaches', 'Fruit'],
    ['anchovies', 'Meat & Seafood'],
    ['bay leaves', 'Herbs & Spices'],
  ])('%j → %j', (name, expected) => {
    expect(categorize(name)).toBe(expected);
  });
});

describe('categorize covers common items people had to file by hand', () => {
  it.each([
    ['tagliatelle', 'Pantry'],
    ['orzo', 'Pantry'],
    ['taco shells', 'Pantry'],
    ['coconut cream', 'Pantry'], // not Fruit via "coconut"
    ['chicken stock', 'Pantry'], // not Meat via "chicken"
    ['tinned tomatoes', 'Pantry'],
    ['croissants', 'Bakery'],
    ['papaya', 'Fruit'],
    ['mixed fruit', 'Fruit'],
    ['cola', 'Beverages'],
    ['tonic', 'Beverages'],
    ['elderflower cordial', 'Beverages'],
    ['oat fraîche', 'Dairy & Eggs'], // not Pantry via "oat"
    ['oat milk', 'Dairy & Eggs'],
    ['diced meat', 'Meat & Seafood'],
    ['gammon steaks', 'Meat & Seafood'],
    ['ras el hanout seasoning', 'Herbs & Spices'],
    ['garam masala', 'Herbs & Spices'],
  ])('%j → %j', (name, expected) => {
    expect(categorize(name)).toBe(expected);
  });
});
