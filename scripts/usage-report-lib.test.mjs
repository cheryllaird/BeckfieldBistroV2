import { describe, it, expect } from 'vitest';
import { aggregateUsage, suppress, weekStart } from './usage-report-lib.mjs';

const NOW = Date.parse('2026-11-01T12:00:00Z');
const bistro = (over = {}) => ({
  memberCount: 1,
  recipes: [],
  mealEntries: [],
  pantryItems: [],
  shoppingItems: [],
  categoryLogs: [],
  ...over,
});

describe('suppress', () => {
  it('hides counts under 3', () => {
    expect(suppress(0)).toBe('<3');
    expect(suppress(2)).toBe('<3');
    expect(suppress(3)).toBe(3);
  });
});

describe('weekStart', () => {
  it('returns the Monday of the week', () => {
    expect(weekStart(Date.parse('2026-11-01T12:00:00Z'))).toBe('2026-10-26'); // Sunday
    expect(weekStart(Date.parse('2026-10-26T00:00:00Z'))).toBe('2026-10-26');
  });
});

describe('aggregateUsage', () => {
  it('counts an old bistro with one recent meal entry as active this week', () => {
    const old = Date.parse('2025-01-01T00:00:00Z');
    const bistros = Array.from({ length: 3 }, () =>
      bistro({
        recipes: [{ updateTime: old }],
        mealEntries: [{ type: 'recipe', recipeId: 'r1', updateTime: Date.parse('2026-10-30T09:00:00Z') }],
      }),
    );
    const out = aggregateUsage({ bistros, unmigratedUsers: 0 }, NOW);
    expect(out.weeklyActiveBistros['2026-10-26']).toBe(3);
    expect(out.weeklyActiveBistros['2026-10-19']).toBe('<3');
  });

  it('names an ingredient only when it appears in 3+ bistros', () => {
    const log = (ingredientKey) => ({ ingredientKey, source: 'pantry', fromCategory: 'Other', toCategory: 'Dairy' });
    const bistros = [
      bistro({ categoryLogs: [log('milk'), log('secret sauce')] }),
      bistro({ categoryLogs: [log('milk')] }),
      bistro({ categoryLogs: [log('milk')] }),
    ];
    const out = aggregateUsage({ bistros, unmigratedUsers: 0 }, NOW);
    expect(out.categoryMoves.namedIngredients).toEqual({ milk: 3 });
    expect(out.categoryMoves.otherIngredients).toBe('<3');
    expect(out.categoryMoves.byMove['pantry: Other→Dairy']).toBe(4);
  });

  it('treats a missing inStock as in stock', () => {
    const pantry = [{ updateTime: 1 }, { inStock: false, updateTime: 1 }];
    const out = aggregateUsage({ bistros: [bistro({ pantryItems: pantry }), bistro({ pantryItems: pantry }), bistro({ pantryItems: pantry })], unmigratedUsers: 5 }, NOW);
    expect(out.pantry.inStockShare).toBe(0.5);
    expect(out.pantry.bistrosWithPantry).toBe(3);
    expect(out.unmigratedAccounts).toBe(5);
  });

  it('merges the last 30 days of daily extraction counters', () => {
    const out = aggregateUsage(
      {
        bistros: [],
        unmigratedUsers: 0,
        extraction: {
          lifetime: { total: 10, counts: { 'ocr+local': 10 }, fallbackReasons: { 'vision-recitation': 4 } },
          daily: [
            { date: '2026-10-30', total: 2, counts: { 'ocr+local': 2 } },
            { date: '2026-08-01', total: 8, counts: { 'ocr+local': 8 } },
          ],
        },
      },
      NOW,
    );
    expect(out.extraction.lifetime.methods).toEqual({ 'ocr+local': 10 });
    expect(out.extraction.last30Days).toEqual({ total: 2, methods: { 'ocr+local': 2 }, fallbackReasons: {} });
  });

  it('never emits ids, item names or titles', () => {
    const bistros = Array.from({ length: 4 }, (_, i) =>
      bistro({
        memberCount: 2,
        recipes: [{ id: `recipe-id-${i}`, title: 'Grandma Lasagne', updateTime: NOW }],
        mealEntries: [{ id: 'meal-id', type: 'recipe', recipeId: `recipe-id-${i}`, customTitle: 'Secret Stew', updateTime: NOW }],
        pantryItems: [{ id: 'pantry-id', name: 'saffron', inStock: true, updateTime: NOW }],
        categoryLogs: [{ itemName: 'Private Item', ingredientKey: i === 0 ? 'rare thing' : 'milk', source: 'shopping-list', fromCategory: 'Other', toCategory: 'Dairy' }],
      }),
    );
    const text = JSON.stringify(aggregateUsage({ bistros, unmigratedUsers: 1 }, NOW));
    for (const leak of ['recipe-id', 'meal-id', 'pantry-id', 'Lasagne', 'Secret', 'saffron', 'Private', 'rare thing']) {
      expect(text).not.toContain(leak);
    }
  });
});
