// Ko-fi tip prompt: a one-off thank-you shown when a user saves their 5th or
// 10th recipe, plus a quiet link in Settings. It's a plain outbound link — no
// Ko-fi widget or script is loaded, so nothing is sent to Ko-fi unless the user
// taps it.

// TODO(owner): replace with the real Ko-fi page before merging.
export const KOFI_URL = 'https://ko-fi.com/beckfieldbistro';

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
