import { describe, expect, it } from 'vitest';
import { editedFields } from './recipeEdits';
import { makeIngredient, makeRecipe } from '../test/factories';

const flour = makeIngredient({ name: 'flour', quantity: 200, unit: 'g', originalText: '200g flour' });
const draft = makeRecipe({ title: 'Cake', ingredients: [flour], ingredientSections: undefined, steps: ['Mix', 'Bake'] });

describe('editedFields', () => {
  it('is empty for an unchanged save', () => {
    expect(editedFields(draft, draft)).toEqual([]);
  });

  it('ignores whitespace-only changes and blank rows', () => {
    const saved = {
      ...draft,
      title: '  Cake ',
      ingredients: [{ ...flour, name: ' flour ', originalText: ' 200g flour ' }],
      ingredientSections: [{ title: '', ingredients: [{ ...flour, name: ' flour ', originalText: ' 200g flour ' }] }],
      steps: [' Mix ', '', 'Bake  '],
    };
    expect(editedFields(draft, saved)).toEqual([]);
  });

  it('reports a changed ingredient quantity', () => {
    const saved = { ...draft, ingredients: [{ ...flour, quantity: 250 }] };
    expect(editedFields(draft, saved)).toEqual(['ingredients']);
  });

  it('reports a changed title and steps', () => {
    expect(editedFields(draft, { ...draft, title: 'Sponge', steps: ['Mix'] })).toEqual(['title', 'steps']);
  });

  it('compares against section ingredients when the draft has sections', () => {
    const sectioned = { ...draft, ingredientSections: [{ title: 'Base', ingredients: [flour] }] };
    expect(editedFields(sectioned, { ...draft, ingredientSections: [{ title: '', ingredients: [flour] }] })).toEqual([]);
  });
});
