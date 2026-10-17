// The app's legal pages and the version of the Terms users must accept.
//
// The pages are served by the app itself (src/legal/*.md, rendered by
// pages/Legal). termsVersion is the Terms' effective date: when the Terms
// change, update src/legal/terms.md and set a new version here, and every
// user is asked to accept again. An empty termsVersion turns the step off.

export const LEGAL = {
  termsVersion: '2026-10-17',
  termsUrl: '/terms',
  privacyUrl: '/privacy',
  copyrightUrl: '/copyright',
};

/** True once the Terms and Privacy Policy are published and acceptance is required. */
export function legalLive(legal = LEGAL): boolean {
  return !!(legal.termsVersion && legal.termsUrl && legal.privacyUrl);
}

/**
 * Whether the signed-in user must accept the current Terms before using the
 * app. `accepted` is undefined until their profile has loaded, which never
 * blocks: an offline launch, or one before the profile arrives, isn't held up.
 */
export function needsTermsAcceptance(accepted: string | null | undefined, legal = LEGAL): boolean {
  return legalLive(legal) && accepted !== undefined && accepted !== legal.termsVersion;
}
