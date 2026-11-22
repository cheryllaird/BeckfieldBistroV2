import { describe, expect, it } from 'vitest';
import { filterAndSortRecipes, filterRecipes, sortRecipes } from './librarySort';
import { makeIngredient, makeRecipe } from '../test/factories';

const old = makeRecipe({ id: 'old', title: 'Old stew', createdAt: '2026-01-01T00:00:00.000Z' });
const mid = makeRecipe({ id: 'mid', title: 'Mid curry', createdAt: '2026-02-01T00:00:00.000Z' });
const neu = makeRecipe({ id: 'new', title: 'New salad', createdAt: '2026-03-01T00:00:00.000Z' });
const ids = (list: { id: string }[]) => list.map((r) => r.id);

describe('sortRecipes', () => {
  it('Newest orders by createdAt, newest first, ignoring plan counts', () => {
    const counts = new Map([['old', 9]]);
    expect(ids(sortRecipes([old, neu, mid], 'newest', counts))).toEqual(['new', 'mid', 'old']);
  });

  it('Most planned orders by count, highest first', () => {
    const counts = new Map([['old', 5], ['mid', 2], ['new', 1]]);
    expect(ids(sortRecipes([neu, mid, old], 'most-planned', counts))).toEqual(['old', 'mid', 'new']);
  });

  it('breaks ties, including never-planned recipes, newest first', () => {
    const counts = new Map([['old', 3], ['mid', 3]]);
    const extra = makeRecipe({ id: 'older', createdAt: '2025-01-01T00:00:00.000Z' });
    expect(ids(sortRecipes([old, extra, neu, mid], 'most-planned', counts))).toEqual([
      'mid', 'old', 'new', 'older',
    ]);
  });

  it('with no plans at all, Most planned matches Newest', () => {
    expect(ids(sortRecipes([old, neu, mid], 'most-planned', new Map()))).toEqual(['new', 'mid', 'old']);
  });

  it('does not mutate its input', () => {
    const input = [old, neu];
    sortRecipes(input, 'newest', new Map());
    expect(ids(input)).toEqual(['old', 'new']);
  });
});

describe('filterRecipes', () => {
  const aubergine = makeRecipe({
    id: 'aub', title: 'Moussaka', source: 'Gran',
    ingredients: [makeIngredient({ name: 'Aubergine' })],
  });

  it('matches title, source or ingredient name in any case', () => {
    const all = [old, mid, aubergine];
    expect(ids(filterRecipes(all, 'CURRY'))).toEqual(['mid']);
    expect(ids(filterRecipes(all, 'gran'))).toEqual(['aub']);
    expect(ids(filterRecipes(all, 'aubergine'))).toEqual(['aub']);
  });

  it('returns everything for a blank query', () => {
    expect(filterRecipes([old, mid], '   ')).toHaveLength(2);
  });
});

describe('filterAndSortRecipes', () => {
  it('sorts search results without changing how many there are', () => {
    const a = makeRecipe({ id: 'a', title: 'Chicken pie', createdAt: '2026-03-01T00:00:00.000Z' });
    const b = makeRecipe({ id: 'b', title: 'Chicken curry', createdAt: '2026-01-01T00:00:00.000Z' });
    const counts = new Map([['b', 4]]);
    const newest = filterAndSortRecipes([a, b, old], 'chicken', 'newest', counts);
    const planned = filterAndSortRecipes([a, b, old], 'chicken', 'most-planned', counts);
    expect(ids(newest)).toEqual(['a', 'b']);
    expect(ids(planned)).toEqual(['b', 'a']);
  });
});
