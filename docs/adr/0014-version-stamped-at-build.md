# 0014. Stamp the app version at build time

- **Status:** Accepted
- **Date:** 2026-10-17
- **Deciders:** Cheryl Laird

## Context

`bump-version.yml` committed a patch bump to `main` after every merge. With `main` protected by a
ruleset (ADR 0008), that push needs a bypass, and GitHub doesn't offer GitHub Actions as a
bypass actor on this personal-account repository. A bot that can push straight to production
also weakens the "nothing reaches `main` without a PR" rule. The version is only displayed in
the profile menu, alongside the build commit.

## Decision

- Remove `bump-version.yml`. Nothing commits to `main` except merged PRs.
- `vite.config.ts` builds `__APP_VERSION__` as `major.minor` from `package.json` plus the UTC
  build date, e.g. `1.0.20261017`. `__APP_BUILD__` (the short commit from Vercel) still
  identifies the exact build.
- Bump `major.minor` in `package.json` by hand, in a PR, for releases that deserve it. The patch
  number in `package.json` is no longer used.

## Consequences

- The `main` ruleset needs no bypass actors.
- No more `chore: bump version` commits in history or merge conflicts in `package.json`.
- Two deploys on the same day share a version; the build commit tells them apart.
- Rebuilding an old commit later gives it a later date. Use the commit to identify a build.

## Alternatives considered

- **Deploy-key bypass for the bump workflow:** keeps sequential numbers, but stores a write
  credential that bypasses protection on `main`.
- **Bump in each PR:** parallel agent PRs would conflict on every merge.
