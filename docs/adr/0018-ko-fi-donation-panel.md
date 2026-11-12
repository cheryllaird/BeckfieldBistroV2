# 0018. Embed Ko-fi's donation panel, loaded only on request

- **Status:** Proposed
- **Date:** 2026-11-12
- **Deciders:** the PR reviewer
- **PR:** https://github.com/cheryllaird/BeckfieldBistroV2/pull/229

## Context

The owner wants users to be able to tip through Ko-fi without leaving the app. It should be
reachable from the user menu and must not intrude. Until now the app loaded nothing from third
parties except Google (Firebase, Gemini via `api/`), and no third party learned that a user was
using the app.

Ko-fi offers three widgets: a floating button and a styled button (both load a Ko-fi script on
every page) and a donation panel (an `<iframe>` of the Ko-fi page).

## Decision

- Use the **donation panel** iframe (`KOFI_PANEL_URL` in `src/lib/tips.ts`). Don't load any Ko-fi
  script.
- Show it in a bottom sheet, `src/components/SupportPanelModal.tsx`, rendered once in `AppLayout`
  and opened through store state (`supportPanelOpen`, not persisted). It's opened from the user
  menu ("Buy me a coffee"), the Settings support card and the one-off thank-you note.
- The iframe **only exists while the sheet is open**, so Ko-fi isn't contacted unless the user
  asks. Offline, the sheet says tipping needs a connection instead of loading the frame.
- The frame is sandboxed: scripts, forms and pop-ups (PayPal or card checkout windows) are allowed,
  but **top-level navigation isn't**, so the panel can't navigate the app away. A link under the
  frame opens the Ko-fi page in the browser in case checkout doesn't work in the frame.
- `https://ko-fi.com` is added to `frame-src` in the report-only CSP in `vercel.json`. The
  enforced CSP doesn't restrict frames, so this keeps the report-only policy accurate for when it's
  enforced.
- `Permissions-Policy: payment=()` is unchanged, so browser payment sheets (Apple Pay or Google Pay
  through the Payment Request API) may not appear inside the panel. The fallback link covers that.
- The Privacy Policy names Ko-fi as a service the user can choose to open.

## Consequences

- Users can tip without leaving the app; nobody who doesn't open the sheet is exposed to Ko-fi.
- Opening the sheet lets Ko-fi and its payment providers see the user's IP address and set their
  own cookies in the frame. That's disclosed in the Privacy Policy.
- If Ko-fi blocks being framed or changes the panel URL, the sheet shows a broken frame, and the
  fallback link still works. Revisit if Ko-fi changes its widget.
- Enforcing the full CSP later must keep `https://ko-fi.com` in `frame-src`.

## Alternatives considered

- **Plain outbound link only (the first version of this PR):** the most private, but it takes users
  out of the app, which the owner wanted to avoid.
- **Ko-fi floating button:** always on screen and loads a third-party script on every page, which
  contradicts "doesn't intrude" and exposes every visit to Ko-fi.
- **Allowing `payment` for ko-fi.com in Permissions-Policy:** might enable Apple Pay or Google Pay
  in the frame, but it delegates a powerful feature to a third party and its nested payment frames
  for an uncertain gain. Not worth it before the plain panel has been tried.
