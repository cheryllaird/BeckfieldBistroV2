import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatDayLabel,
  formatTime,
  getRecipeIngredients,
  getWeekDays,
  isoDate,
  recipeSourceLabel,
  scaleIngredient,
  sortSourcesByRecentUse,
} from './utils';
import { makeIngredient, makeRecipe } from '../test/factories';

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

describe('sortSourcesByRecentUse', () => {
  const r = (source: string, createdAt?: string) =>
    makeRecipe({ source, createdAt: createdAt as string });

  it('orders by the newest recipe using each source', () => {
    const recipes = [r('A', '2026-01-01'), r('B', '2026-03-01'), r('C', '2026-02-01'), r('A', '2025-12-01')];
    expect(sortSourcesByRecentUse(['A', 'B', 'C'], recipes)).toEqual(['B', 'C', 'A']);
  });

  it('ranks a source by its newest recipe', () => {
    const recipes = [r('A', '2026-01-01'), r('B', '2026-02-01'), r('A', '2026-03-01')];
    expect(sortSourcesByRecentUse(['A', 'B'], recipes)).toEqual(['A', 'B']);
  });

  it('puts unused sources last, newest added first', () => {
    const recipes = [r('C', '2026-01-01')];
    expect(sortSourcesByRecentUse(['A', 'B', 'C', 'D'], recipes)).toEqual(['C', 'D', 'B', 'A']);
  });

  it('keeps reverse stored order for ties', () => {
    const recipes = [r('A', '2026-01-01'), r('B', '2026-01-01')];
    expect(sortSourcesByRecentUse(['A', 'B'], recipes)).toEqual(['B', 'A']);
  });

  it('treats a missing createdAt as oldest', () => {
    const recipes = [r('A', undefined), r('B', '2020-01-01')];
    expect(sortSourcesByRecentUse(['A', 'B'], recipes)).toEqual(['B', 'A']);
  });

  it('never suggests Unknown, in any case', () => {
    const recipes = [r('Unknown', '2026-05-01'), r('A', '2026-01-01')];
    expect(sortSourcesByRecentUse(['A', 'Unknown', 'unknown', 'UNKNOWN'], recipes)).toEqual(['A']);
  });

  it('matches case-insensitively and ignoring whitespace', () => {
    const recipes = [r('bbc good food ', '2026-05-01'), r('A', '2026-01-01')];
    expect(sortSourcesByRecentUse(['A', 'BBC Good Food'], recipes)).toEqual(['BBC Good Food', 'A']);
  });

  it('does not mutate its inputs and handles empties', () => {
    const known = ['A', 'B'];
    const recipes = [r('A', '2026-01-01')];
    sortSourcesByRecentUse(known, recipes);
    expect(known).toEqual(['A', 'B']);
    expect(recipes).toHaveLength(1);
    expect(sortSourcesByRecentUse([], [])).toEqual([]);
  });
});
