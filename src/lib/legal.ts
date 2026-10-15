// The app's legal pages and the version of the Terms users must accept.
//
// Until the final, solicitor-reviewed text is published, termsVersion is ''
// and the acceptance step is off. To launch it: publish the pages, fill in
// their URLs, and set termsVersion (e.g. the effective date, '2026-11-01').
// Changing termsVersion later asks every user to accept again.

export const LEGAL = {
  termsVersion: '',
  termsUrl: '',
  privacyUrl: '',
  copyrightUrl: '',
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
