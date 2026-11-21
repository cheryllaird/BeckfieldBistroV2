import { describe, expect, it } from 'vitest';
import { countPlans } from './recipePopularity';
import { makeMealEntry } from '../test/factories';

describe('countPlans', () => {
  it('returns an empty map for no entries', () => {
    expect(countPlans([])).toEqual(new Map());
  });

  it('counts one per recipe entry, past and future alike', () => {
    const counts = countPlans([
      makeMealEntry({ id: 'a', recipeId: 'r1', date: '2020-01-01' }),
      makeMealEntry({ id: 'b', recipeId: 'r1', date: '2099-12-31' }),
      makeMealEntry({ id: 'c', recipeId: 'r2' }),
    ]);
    expect(counts.get('r1')).toBe(2);
    expect(counts.get('r2')).toBe(1);
  });

  it('counts lunch and dinner on the same day as two', () => {
    const counts = countPlans([
      makeMealEntry({ id: 'a', recipeId: 'r1', date: '2026-11-19', mealTime: 'lunch' }),
      makeMealEntry({ id: 'b', recipeId: 'r1', date: '2026-11-19', mealTime: 'dinner' }),
    ]);
    expect(counts.get('r1')).toBe(2);
  });

  it('ignores custom and dining-out entries, and recipe entries without a recipeId', () => {
    const counts = countPlans([
      makeMealEntry({ id: 'a', type: 'custom', recipeId: undefined, customTitle: 'Toast' }),
      makeMealEntry({ id: 'b', type: 'dining-out', recipeId: undefined, location: 'Pub' }),
      makeMealEntry({ id: 'c', type: 'custom', recipeId: 'r1' }),
      makeMealEntry({ id: 'd', type: 'recipe', recipeId: undefined }),
    ]);
    expect(counts.size).toBe(0);
  });

  it('does not throw for entries whose recipe was deleted', () => {
    expect(() => countPlans([makeMealEntry({ recipeId: 'gone' })])).not.toThrow();
  });
});
