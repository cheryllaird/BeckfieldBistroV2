# 0007. Per-user Gemini keys, encrypted at rest

- **Status:** Accepted (back-filled)
- **Date:** 2026-10-04

## Context

AI recipe extraction calls Gemini. A shared app key would make the owner pay for every
user's usage and would be a single valuable secret to abuse.

## Decision

- Each user provides their own Gemini API key in Settings. `api/save-gemini-key.ts` checks its
  shape and stores it encrypted with AES-256-GCM (`api/_utils/crypto.ts`) in
  `users/{uid}/meta/profile`.
- The encryption key (`API_KEY_ENCRYPTION_SECRET`) exists only in Vercel env vars. Keys are
  decrypted only server-side during extraction, and never returned to the client or logged.
- Extraction has deterministic fallbacks (JSON-LD, OCR + local parser), so a missing or failing
  key degrades rather than breaks the feature. See `docs/recipe-extraction.md`.

## Consequences

- Rotating `API_KEY_ENCRYPTION_SECRET` requires re-encrypting or re-collecting keys.
- Bistro members each use their own key, even in a shared bistro.

## Alternatives considered

- **Shared server key:** simpler onboarding, but unbounded cost and a bigger blast radius.
