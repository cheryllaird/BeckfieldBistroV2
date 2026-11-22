# 0020. Pasted-text extraction input

- **Status:** Accepted
- **Date:** 2026-11-22
- **Deciders:** Cheryl Laird
- **PR:** see issue #245 (follows #244)

## Context

Some recipe sites' bot protection never answers the app's server-side page fetch. Since #244 the
user is told the site blocks automatic imports. The owner declined making the server pose as a
browser to get round that. The user can still read the page in their own browser, so the most
accurate route left is for them to copy the recipe text and paste it in. `/api/extract-recipe`
accepted only a photo or a URL, and `importMeta.method` (ADR 0017) had no value for this.

## Decision

- `/api/extract-recipe` gets a third input kind, `{ text, sourceUrl? }`. It stays one endpoint.
  Exactly one of `base64`, `url` or `text` is accepted (none or several → 400). The text is
  trimmed and capped at 20,000 characters on the server (413 over it; whitespace only → 400).
- The ladder is `text+gemini` → `text+local` (`stripWebClutter` + `parseRecipeText`) → `failed`.
  **ADR 0010 applies unchanged:** a RECITATION block on pasted text falls to the local parser and
  is never sent to Gemini again in another form. No message on a RECITATION or a failed text
  extraction suggests another route (Photo, Paste text, screenshots).
- **Pasting is a choice the user makes, in their own browser, about a page they are reading.**
  The app does not get round the site's block itself. A user could paste text that a URL
  extraction was just declined for. That is a separate request the user chose to make, the same
  exposure as the existing photo route, and it gets the same RECITATION handling.
- `sourceUrl` is optional and **never fetched**, neither the page nor an image, so it adds no
  `safeFetch` surface (ADR 0005). It must be an `http(s)` URL with a dotted hostname, at most 2,048 characters,
  because it is stored as the recipe's `sourceUrl` and rendered as a link that is shared with the
  bistro. Its hostname is the recipe's `source`; with no link, the source is "Pasted text".
- The pasted text is untrusted page content. It is fenced between markers (removed from the text
  itself, so it can't close the block early) and the prompt names it as data, not instructions. It is never logged (only `textLength`), never stored and never echoed
  back. Only the recipe the user saves is kept.
- **Amends ADR 0017:** `importMeta.method` gains `'text'`. The analytics keys `text+gemini`,
  `text+local` and `textGemini-*` join the existing counters, and the timing line gains
  `kind=text` and the `textGemini` stage.

## Consequences

- No Firestore rules, account-deletion or expiry change. Recipes made this way are ordinary
  recipes, already removed with the account (ADR 0011), and nothing new is stored server-side.
- The Privacy Policy names pasted text and its optional link, and Gemini as a recipient of it.
  The Terms are unchanged, so `termsVersion` stays as it is (ADR 0013).
- `parseRecipeText` was tuned on OCR. `stripWebClutter` handles common page furniture, but
  `text+local` results from very noisy pastes will still need tidying in the form.

## Alternatives considered

- **Make the server pose as a browser.** Declined by the owner: it deliberately gets round a site
  that has said no, and it would be an arms race with its bot protection.
- **A separate endpoint.** It would duplicate auth, key handling, retries and analytics. The one
  endpoint was chosen on purpose (`docs/recipe-extraction.md` §2).
- **Fetch the link for a cover image.** That would put back the blocked fetch, add an SSRF surface
  for no benefit, and the user can paste an image URL in the form instead.
- **Parse on the device so pasting works offline.** Possible later; `parseRecipeText` lives in
  `api/_utils/`, so this would be its own change.
