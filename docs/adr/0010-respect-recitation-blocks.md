# 0010. Respect Gemini copyright (recitation) blocks

- **Status:** Accepted (back-filled from #157)
- **Date:** 2026-10-17

## Context

Gemini can decline to transcribe a page under its RECITATION (copyright) filter. The photo
pipeline used to hand the OCR transcription of the same page back to Gemini, which worked
around the block rather than respecting it.

## Decision

- When Gemini declines content for RECITATION, the same content is never sent back to the model
  in another form. The photo path goes straight to the deterministic local parser on the OCR
  text. The URL path never retries a RECITATION block.
- User-facing messages don't suggest ways around the block.
- Every fallback records its reason (`<step>-<reason>`, e.g. `vision-recitation`) under
  `fallbackReasons` in the extraction analytics, alongside the per-method counts.

## Consequences

- Some copyrighted pages produce a rougher, locally parsed recipe the user has to tidy up.
- New extraction steps must preserve this rule and record their fallback reasons. See
  `docs/recipe-extraction.md`.

## Alternatives considered

- **Retry via OCR text, or at a higher temperature:** better results, but deliberately routes
  around a provider's copyright control.
