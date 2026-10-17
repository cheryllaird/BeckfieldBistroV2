# 0009. A UK-first ingredient engine in `src/lib/ingredients/`

- **Status:** Accepted (back-filled from #154)
- **Date:** 2026-10-17

## Context

Shopping lists are built by merging ingredient lines from many recipes, often from US sites.
Lines failed to merge ("Shallots, or red onion" vs "Shallots", "cilantro" vs "coriander"),
quantities came out unbuyable ("5 ⅔ spring onions"), and the logic had grown into one large
`src/lib/utils.ts`. Category corrections were logged but never reused.

## Decision

- Ingredient handling lives in `src/lib/ingredients/`, split by concern: `ukNames` (US → UK
  names, applied first), `canonicalName` (merge keys: alternatives, prep notes and cut shapes
  are dropped, accents ignored), `amounts` (whole items round up to what you can buy),
  `categorize`, `pantry` and `consolidate` (one shared line builder).
- Recipes keep ingredient lines as written. Prep notes are stripped only for the shopping list.
- A category a bistro member picks is remembered per bistro in `categoryOverrides` (one doc per
  normalised ingredient name) and beats keyword matching wherever that ingredient is added.
  Every change is also appended to `categoryOverrideLogs`.

## Consequences

- UK names are canonical: new synonyms go in `ukNames.ts`, with tests.
- Merge behaviour is pinned by the tests beside each module. Changing a key changes how
  existing lists merge, so treat it as a behaviour change.
- `categoryOverrides` is bistro data and is covered by the `bistros/{bid}/{collection}` rule.

## Alternatives considered

- **AI-based consolidation:** slower, costs the user's Gemini quota, and isn't deterministic
  offline.
