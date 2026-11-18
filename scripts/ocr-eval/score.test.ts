import { describe, it, expect } from 'vitest';
import {
  aggregate,
  cer,
  levenshtein,
  matchItems,
  normalizeUnit,
  scoreParsed,
  scoreText,
  similarity,
  substringDistance,
  type RecipeLike,
  type ScoredIngredient,
} from './score';

const ing = (originalText: string, quantity: number, unit: string): ScoredIngredient => ({
  name: originalText,
  quantity,
  unit,
  originalText,
});

const truth: RecipeLike = {
  title: 'Rosemary White Bean Soup',
  servings: 4,
  ingredientSections: [
    { title: '', ingredients: [ing('2 tbsp olive oil', 2, 'tbsp'), ing('1 tsp salt', 1, 'tsp'), ing('3 cloves garlic', 3, 'cloves')] },
  ],
  steps: ['Heat the oil.', 'Add the garlic and cook.'],
};

describe('text helpers', () => {
  it('levenshtein counts single-character edits', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
  });

  it('similarity ignores case, typography and whitespace', () => {
    expect(similarity('Don’t  STIR', "don't stir")).toBe(1);
    expect(similarity('', '')).toBe(1);
    expect(similarity('abc', 'xyz')).toBe(0);
  });

  it('substringDistance skips surrounding text for free', () => {
    expect(substringDistance('olive oil', 'heat 2 tbsp olive oil then')).toBe(0);
    expect(substringDistance('olive oil', 'heat 2 tbsp o1ive oil then')).toBe(1);
  });

  it('normalizeUnit folds plurals and long forms', () => {
    expect(normalizeUnit('Tablespoons')).toBe('tbsp');
    expect(normalizeUnit('cloves')).toBe('clove');
    expect(normalizeUnit('g')).toBe('g');
  });
});

describe('matchItems', () => {
  it('pairs exact and fuzzy matches one-to-one', () => {
    const pairs = matchItems(['2 tbsp olive oil', '1 tsp salt'], ['1 tsp sa1t', '2 tbsp olive oil'], 0.8);
    expect(pairs).toEqual([
      [0, 1],
      [1, 0],
    ]);
  });

  it('leaves dissimilar items unmatched', () => {
    expect(matchItems(['2 tbsp olive oil'], ['preheat the oven'], 0.8)).toEqual([]);
  });

  it('never reuses a predicted item', () => {
    expect(matchItems(['1 tsp salt', '1 tsp salt'], ['1 tsp salt'], 0.8)).toHaveLength(1);
  });
});

describe('scoreParsed', () => {
  it('scores a perfect parse as perfect', () => {
    const s = scoreParsed(truth, truth);
    expect(s).toMatchObject({
      ingredientsTruth: 3,
      ingredientsMatched: 3,
      ingredientsPredicted: 3,
      quantityUnitExact: 3,
      stepEdits: 0,
      stepCountMatch: true,
      title: true,
      servings: true,
      edits: 0,
    });
    expect(cer(s)).toBe(0);
  });

  it('matches fuzzy ingredient text and checks quantity and unit separately', () => {
    const predicted: RecipeLike = {
      ...truth,
      ingredientSections: undefined,
      ingredients: [ing('2 tbsp o1ive oil', 2, 'tablespoons'), ing('1 tsp salt', 2, 'tsp'), ing('3 cloves garlic', 3, 'clove')],
    };
    const s = scoreParsed(truth, predicted);
    expect(s.ingredientsMatched).toBe(3);
    expect(s.quantityUnitExact).toBe(2); // salt has the wrong quantity
    expect(s.edits).toBe(2); // the o1ive typo and the salt quantity
  });

  it('counts missing and extra ingredients against recall and precision', () => {
    const predicted: RecipeLike = {
      ...truth,
      ingredientSections: [{ title: '', ingredients: [ing('2 tbsp olive oil', 2, 'tbsp'), ing('Serves 4', 4, '')] }],
    };
    const s = scoreParsed(truth, predicted);
    expect(s.ingredientsMatched).toBe(1);
    expect(s.ingredientsTruth).toBe(3);
    expect(s.ingredientsPredicted).toBe(2);
    expect(s.edits).toBe(3); // two missing, one extra
  });

  it('gives a CER of 1 when no steps were found', () => {
    const s = scoreParsed(truth, { ...truth, steps: [] });
    expect(cer(s)).toBe(1);
    expect(s.stepCountMatch).toBe(false);
  });

  it('ignores step numbering', () => {
    const s = scoreParsed(truth, { ...truth, steps: ['1. Heat the oil.', '2) Add the garlic and cook.'] });
    expect(s.stepEdits).toBe(0);
  });

  it('handles an empty truth without dividing by zero', () => {
    const empty: RecipeLike = { title: '', servings: 0, ingredients: [], steps: [] };
    const s = scoreParsed(empty, truth);
    expect(s.ingredientsTruth).toBe(0);
    expect(cer(s)).toBeNull();
    const m = aggregate([{ score: s, gatePassed: true }]);
    expect(m.ingredientRecall).toBeNull();
    expect(m.stepCer).toBeNull();
    expect(m.ingredientPrecision).toBe(0);
  });
});

describe('scoreText', () => {
  it('finds truth content in reading order', () => {
    const text = 'ROSEMARY WHITE BEAN SOUP\n2 tbsp olive oil\n1 tsp salt\n3 cloves garlic\nMETHOD\n1. Heat the oil.\n2. Add the garlic\nand cook.';
    const s = scoreText(truth, text);
    expect(s.ingredientsMatched).toBe(3);
    expect(s.title).toBe(true);
    expect(cer(s)).toBe(0);
    expect(s.ingredientsPredicted).toBeNull();
    expect(s.edits).toBeNull();
  });

  it('misses content that is absent or interleaved', () => {
    const s = scoreText(truth, '2 tbsp olive oil Heat the 1 tsp salt oil.');
    expect(s.ingredientsMatched).toBe(2);
    expect(s.title).toBe(false);
    expect(cer(s)!).toBeGreaterThan(0);
  });
});

describe('aggregate', () => {
  it('micro-averages counts and rates booleans', () => {
    const perfect = scoreParsed(truth, truth);
    const noSteps = scoreParsed(truth, { ...truth, steps: [] });
    const m = aggregate([
      { score: perfect, gatePassed: true },
      { score: noSteps, gatePassed: false },
    ]);
    expect(m.photos).toBe(2);
    expect(m.ingredientRecall).toBe(1);
    expect(m.stepCer).toBe(0.5);
    expect(m.stepCountMatch).toBe(0.5);
    expect(m.gatePass).toBe(0.5);
    expect(m.withinTwoEdits).toBe(1); // missing two steps is two edits
  });

  it('reports parser-only metrics as null for text stages', () => {
    const m = aggregate([{ score: scoreText(truth, ''), gatePassed: false }]);
    expect(m.ingredientPrecision).toBeNull();
    expect(m.quantityUnitExact).toBeNull();
    expect(m.servings).toBeNull();
    expect(m.withinTwoEdits).toBeNull();
    expect(m.ingredientRecall).toBe(0);
    expect(m.stepCer).toBe(1);
  });
});
