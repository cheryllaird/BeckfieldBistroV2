# 0020. Nudge watching agents when main moves, with a nightly sweep as backstop

- **Status:** Proposed
- **Date:** 2026-11-22
- **Deciders:** Cheryl Laird (PR reviewer)
- **PR:** link, once known

## Context

Agent PRs are stewarded by the session that opened them, which subscribes to that PR's GitHub
activity (ADR 0008, `steward` skill). Merge conflicts usually appear when *another* PR merges
into `main`, which is not an event on the conflicted PR, so its watcher isn't told. PRs whose
session has ended, or that a human opened, have no watcher at all. Conflicted PRs sat until
someone noticed.

## Decision

- **`.github/workflows/conflict-nudge.yml`:** on every push to `main`, check each open PR from
  a `claude/*` branch in this repository. When GitHub reports it no longer merges cleanly,
  comment once per head commit. The comment is a PR event, so a live watcher wakes and resolves
  the conflict under `steward`. The workflow checks out no code, never interpolates PR text,
  and its token can only read PRs and write comments.
- **`pr-sweep` skill and nightly Routine (00:47 UK):** for PRs without a live watcher, merges
  `main` into up to 5 conflicted or mechanically broken agent PRs, pushes to their branches,
  and flags the rest with `status:needs-attention`. It opens no PR of its own and never merges.
- Watchers treat the nudge as a hint and confirm the conflict themselves.

## Consequences

- Conflicts get resolved within minutes when a watcher is alive, and overnight otherwise.
- A second writer can push to a PR branch: the sweep skips PRs with commits from the last
  2 hours to avoid racing a live session, and always merges, never rewrites history.
- If bot comments turn out not to reach watching sessions, switch the nudge to a label change
  or rely on the sweep alone; revisit after the first real conflicts.
- Cloud sessions may be limited to pushing their assigned branch. If the sweep's pushes are
  refused, it flags the PR instead, and this ADR should be revisited.

## Alternatives considered

- **Watch `main` directly from each session:** not possible; subscriptions are per PR.
- **Sweep only:** simpler, but conflicts would wait up to a day even with a live watcher.
- **Workflow merges `main` itself:** no judgement for real conflicts, and it would need
  `contents: write` on PR branches.
