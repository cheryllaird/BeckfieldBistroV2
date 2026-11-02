# 0017. Record hidden import and meal-planning metadata for the usage report

- **Status:** Accepted
- **Date:** 2026-11-02
- **Deciders:** Cheryl Laird
- **PR:** see issue #198

## Context

The usage report (`scripts/usage-report.mjs`, issue #172) could not tell URL, photo and manual
imports apart, whether people correct extracted drafts (a sign of extraction errors), or where
meal plan entries start. `firestore.rules` does not validate recipe or meal entry fields, and
account deletion already removes both collections (ADR 0011).

## Decision

- `Recipe.importMeta?: { method: 'url'|'photo'|'manual', extractionMethod?, editedBeforeSave? }`
  is set once, when New Recipe creates a recipe. Later edits never change it. Manual recipes omit
  `editedBeforeSave`; extracted ones store which of `title`, `ingredients`, `steps` the user
  changed (computed by the pure `editedFields` in `src/lib/recipeEdits.ts`, comparing the
  extraction snapshot with the saved recipe after the same normalisation `RecipeForm` applies).
  Extracting again replaces the snapshot.
- `MealEntry.addedFrom?: 'plan'|'recipe-detail'|'library'` is set where the entry is created;
  `PlanDateModal` takes it as a required prop.
- The fields are never displayed and are not copied into shares (`sendRecipe` and `shareRules`
  whitelist fields). Older documents have none and the report counts them as `unknown`.
- The report reads only these fields (field masks), and applies its existing small-count
  suppression.

## Consequences

- No backfill, no rules change, no migration. Accepted shares carry no `importMeta`.
- The Privacy Policy's aggregate statistics row names this metadata.
- `RecipeForm`'s normalisation and `editedFields` must be kept in step if the form changes.

## Alternatives considered

- Compute from the final recipe alone: cannot tell whether an extraction was corrected.
- Server-side logging: the edit comparison only exists on the client.
