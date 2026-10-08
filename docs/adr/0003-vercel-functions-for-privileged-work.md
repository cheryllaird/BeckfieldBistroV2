# 0003. Vercel functions in `api/` for privileged and AI work

- **Status:** Accepted (back-filled)
- **Date:** 2026-10-04

## Context

Some work can't happen in the browser: anything needing a secret (service account, encryption
key, a user's decrypted Gemini key), admin-only Firestore writes (memberships, invites, shares),
fetching third-party pages (CORS, SSRF risk) and heavy OCR.

## Decision

Privileged work lives in Vercel serverless functions under `api/`, deployed with the frontend.
Each handler:

- authenticates the caller with `getUser` (`api/_utils/auth.ts`), trusting only verified emails;
- keeps pure decision logic in `api/_utils/*Rules.ts` so it can be unit tested;
- reads secrets only from Vercel environment variables.

Current endpoints: `extract-recipe`, `share-recipe`, `bistro`, `migrate-bistro`, `save-gemini-key`.

## Consequences

- One deploy for frontend and API; preview deployments include the API.
- Function limits (duration, bundle size) apply, e.g. `extract-recipe` ships tessdata via
  `vercel.json` `includeFiles`.
- New privileged features add an endpoint here rather than loosening `firestore.rules`.

## Alternatives considered

- **Firebase Cloud Functions:** a second deploy target and billing account for little gain.
