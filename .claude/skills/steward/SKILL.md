---
name: steward
description: Conventions for an agent driving its own Beckfield Bistro pull request to green — CI failures, review comments, merge conflicts. Use after opening a PR and on every PR event.
---

# Steward a PR

- **You never merge, approve, enable auto-merge or close-and-reopen.** The human merges.
- **Merge conflicts:** merge `origin/main` into the branch (no rebase or force-push on shared
  branches). Resolve, then regenerate `package-lock.json` with `npm install`, never by hand.
  `chore: bump version` conflicts in `package.json`/`package-lock.json`: take `main`'s version.
- **CI red:** reproduce locally with the same command (`npm run lint`, `typecheck`, `test`,
  `build`), find the root cause, fix and push. "Flaky" is not a root cause. Never skip, delete or
  `.only`/`.skip` a test to get green.
- **Secret scan red:** treat as real. Remove the secret, add a friction entry, and tell the
  human. A pushed secret must be rotated even after it's removed from history.
- **Review comments:** small, local asks: implement, push, reply briefly, resolve. Larger or
  design-level asks: reply with a proposal and wait. Every comment gets a visible outcome.
- **Before every push:** all four checks pass locally, and you've re-read your diff.
- Keep the PR's template sections accurate as the change evolves (ADR, friction, sensitive paths).
- When the PR is green with nothing left for you, say so once and stop.
