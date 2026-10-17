# 0013. Versioned Terms acceptance before using the app

- **Status:** Accepted (back-filled from #160, #161)
- **Date:** 2026-10-17

## Context

The app needs users to accept its Terms of Service and Privacy Policy, and to accept again when
the terms change. It must not block an offline launch.

## Decision

- The legal pages are Markdown in `src/legal/*.md`, rendered at `/terms`, `/privacy` and
  `/copyright` by a small built-in renderer. They're readable without signing in.
- `src/lib/legal.ts` holds `termsVersion` (the Terms' effective date) and the page URLs. An empty
  version turns the gate off.
- After sign-in, `TermsScreen` asks once per version. The accepted version and time are saved to
  `users/{uid}/meta/profile`, applied locally first so acceptance works offline.
- While the profile hasn't loaded, the accepted version is unknown and the gate doesn't block.

## Consequences

- Changing the Terms means updating the Markdown and bumping `termsVersion`, which asks every
  user again.
- The text is an interim version pending a solicitor's review.

## Alternatives considered

- **Hosting the pages externally:** separate deploys, and the pages could drift from the app.
