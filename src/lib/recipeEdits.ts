import type { EditedField, Ingredient, Recipe } from '../types';
import { getRecipeIngredients } from './utils';

type Editable = Pick<Recipe, 'title' | 'ingredients' | 'steps'> & Partial<Pick<Recipe, 'ingredientSections'>>;

// Normalised the way RecipeForm.handleSave does (trimmed, blank rows dropped,
// originalText rebuilt when empty), so whitespace-only changes don't count.
function ingredientKey(list: Ingredient[]): string {
  return JSON.stringify(
    list
      .filter((i) => i.name.trim())
      .map((i) => [
        i.name.trim(),
        i.quantity,
        i.unit.trim(),
        i.originalText.trim() || `${i.quantity}${i.unit} ${i.name}`.trim(),
      ]),
  );
}

function stepsKey(steps: string[]): string {
  return JSON.stringify(steps.map((s) => s.trim()).filter(Boolean));
}

/** Which of title / ingredients / steps differ between the extracted draft and the saved recipe. */
export function editedFields(draft: Partial<Editable>, saved: Editable): EditedField[] {
  const out: EditedField[] = [];
  if ((draft.title ?? '').trim() !== saved.title.trim()) out.push('title');
  const draftIngredients = getRecipeIngredients({
    ingredients: draft.ingredients ?? [],
    ingredientSections: draft.ingredientSections,
  });
  if (ingredientKey(draftIngredients) !== ingredientKey(getRecipeIngredients(saved))) out.push('ingredients');
  if (stepsKey(draft.steps ?? []) !== stepsKey(saved.steps)) out.push('steps');
  return out;
}
