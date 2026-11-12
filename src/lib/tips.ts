// Tipping via Ko-fi (ADR 0018): a one-off thank-you shown when a user saves
// their 5th or 10th recipe, plus "Buy me a coffee" in the user menu and
// Settings. Each opens Ko-fi's donation panel in an in-app sheet. The panel is
// only loaded when opened, so nothing reaches Ko-fi unless the user asks.

export const KOFI_URL = 'https://ko-fi.com/cheryllaird';

/** Ko-fi's embeddable donation panel for the same page (from its widget setup). */
export const KOFI_PANEL_URL = `${KOFI_URL}/?hidefeed=true&widget=true&embed=true&preview=true`;

/** Saved-recipe counts at which the thank-you note may appear. */
export const TIP_MILESTONES = [5, 10] as const;

/**
 * Whether saving a recipe that brings the user's own count to `ownRecipeCount`
 * should show the thank-you note. It appears at most once per device: the
 * first milestone reached wins, and later milestones are skipped.
 */
export function shouldShowTipPrompt(ownRecipeCount: number, alreadyShown: boolean): boolean {
  if (alreadyShown) return false;
  return (TIP_MILESTONES as readonly number[]).includes(ownRecipeCount);
}
