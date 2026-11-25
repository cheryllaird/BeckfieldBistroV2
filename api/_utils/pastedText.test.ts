import { describe, it, expect } from 'vitest';
import { stripWebClutter } from './pastedText';
import { parseRecipeText } from './recipeParsers';

// A recipe copied straight off a supermarket-style recipe page.
const COPIED_PAGE = [
  'Skip to content',
  'Add to trolley',
  'Leek and potato soup',
  'Serves 4',
  'Prep time 10 mins',
  'Ingredients',
  '2 leeks, sliced',
  '500g potatoes, diced',
  '1 litre vegetable stock',
  'Method',
  '1. Soften the leeks in a large pan.',
  '2. Add the potatoes and stock and simmer for 20 minutes.',
  '3. Blend until smooth.',
  'Rate this recipe',
  '4.5 out of 5 (120 reviews)',
  'Share',
].join('\n');

describe('stripWebClutter', () => {
  it('drops whole lines of page furniture', () => {
    expect(stripWebClutter('Skip to content\nAdd to basket\nSoup\nPrint recipe\n12 reviews\nAccept all cookies')).toBe('Soup');
  });

  it('never edits recipe lines that merely mention clutter words', () => {
    const text = 'Add to the pan and share between bowls\nSave a little stock for later\n2 tbsp oil';
    expect(stripWebClutter(text)).toBe(text);
  });
});

describe('parseRecipeText on pasted web text', () => {
  it('finds the title, ingredients and method once clutter is stripped', () => {
    const parsed = parseRecipeText(stripWebClutter(COPIED_PAGE));

    expect(parsed.title).toBe('Leek and potato soup');
    expect(parsed.servings).toBe(4);
    expect(parsed.ingredientSections.flatMap((s) => s.ingredients.map((i) => i.originalText))).toEqual([
      '2 leeks, sliced',
      '500g potatoes, diced',
      '1 litre vegetable stock',
    ]);
    expect(parsed.steps).toEqual([
      'Soften the leeks in a large pan.',
      'Add the potatoes and stock and simmer for 20 minutes.',
      'Blend until smooth.',
    ]);
  });
});
