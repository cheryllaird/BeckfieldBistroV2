# 0019. Count feature use anonymously through `/api/track`, dropping events while offline

- **Status:** Accepted
- **Date:** 2026-11-11
- **Deciders:** Cheryl Laird (PR reviewer)
- **PR:** see issue #199

## Context

The usage report (`scripts/usage-report.mjs`, ADR 0017) reads stored data, but some behaviour
leaves none: recipe imports started and never saved, how many items the store cupboard keeps off a
generated list, and installed-app vs browser use. An earlier proposal to add Vercel Web Analytics
(page views, a third-party script) was dropped when #172 chose a self-hosted report; this records
the replacement. Clients cannot write to `analytics/` (`firestore.rules`), and
`recordExtractionMethod` in `api/extract-recipe.ts` already keeps anonymous lifetime and daily
counters there with `FieldValue.increment`.

## Decision

- **Contract:** `POST /api/track` (`api/track.ts`) with body `{ event, value }` and nothing else.
  It authenticates with `getUser` (401), accepts only the allow-list in `api/_utils/trackRules.ts`
  (400 for anything else, including extra keys), answers 405 for other methods and 204 otherwise.
  Events: `import_started` / `import_saved` / `import_abandoned` (`url`, `photo`, `manual`),
  `pantry_skip` (`0`, `1`, `2-3`, `4-6`, `7+` items kept off by the store cupboard on Generate
  List) and `display_mode` (`standalone`, `browser`, once per page load after sign-in).
- **Storage:** each event adds one to `counts.<event>.<value>` and `total` in `analytics/usage` and
  `analytics/usage-YYYY-MM-DD`. Field names are the allow-list's own strings written as nested
  maps, so no request text reaches a field path. No uid, bistro id, email or content is stored or
  logged; the uid is only hashed for a best-effort in-memory rate limit (30 events per minute per
  user per function instance; excess is dropped with 204). Write failures are logged without
  detail about the caller and still answer 204.
- **Client:** `track()` in `src/lib/usage.ts` sends through `authedFetch`. It does nothing in
  development or test builds, when signed out, or when `networkStatus` says offline; failures are
  swallowed. **Nothing is queued or stored on the device**: an event that can't be sent now is
  lost. This is a deliberate exception to ADR 0004's offline-first rule, which covers user data,
  not telemetry.
- Import funnel: New Recipe's `useImportTracking` starts an import on its method's first action;
  starting another method abandons it, so per method started = saved + abandoned, less events
  dropped offline and imports left by closing the app (no unmount fires).

## Consequences

- No rules change and nothing for account deletion (ADR 0011) to remove: the counters hold no
  personal data. The Privacy Policy's aggregate statistics row names these counts.
- Counts undercount offline use by design; treat them as rates, not totals. Closing the app
  mid-import shows up only as started minus saved minus abandoned.
- Adding an event means adding it to `TRACK_EVENTS` and the client `UsageEvent` union together,
  the report picks it up unchanged, and the Privacy Policy row may need widening.
- The rate limit is per instance only; a determined signed-in user could inflate counters. Revisit
  (e.g. a Firestore-backed limit) if the figures start driving decisions that matter.

## Alternatives considered

- **Vercel Web Analytics:** page views only, a third-party script, and it can't see in-page
  events such as an abandoned import or cupboard skips.
- **Queue events offline (IndexedDB) and send later:** more code and state on the device for
  telemetry, contrary to "nothing stored on the device".
- **Client writes to Firestore directly:** needs a rules change opening `analytics/` to clients,
  and rules can't validate an increment-only allow-list as simply as the handler does.
- **Per-user counters:** more insight, but personal data needing deletion and retention rules.
