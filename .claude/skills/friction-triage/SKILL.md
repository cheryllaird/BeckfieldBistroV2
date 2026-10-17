---
name: friction-triage
description: Weekly triage of docs/friction-log.md for Beckfield Bistro. Run by a scheduled Routine. Groups open friction entries, fixes the cheap ones in one PR, and files GitHub issues for the rest.
---

# Weekly friction triage

You run unattended. Make at most one PR and never merge.

1. `git fetch origin main && git checkout -B claude/friction-triage-$(date +%Y%m%d) origin/main`.
2. Read every `open` entry in `docs/friction-log.md`. Group duplicates; repeated friction is the
   priority.
3. For each group, decide one:
   - **Fix now:** small, low-risk and outside the off-limits paths in the `nightly-cleanup`
     skill (docs fixes, a missing script, a clearer error, a test helper). Do it. Set the
     status to `fixed in <PR link>`, or `fixed in this PR` before the PR exists.
   - **Issue:** real but bigger, or needs a human decision. Search existing issues first, then
     open one with the friction text, suggested fix and links. Set the status to `issue <link>`.
   - **Won't fix:** obsolete or not actually a problem. Set the status to `wontfix: <reason>`.
4. Never delete entries. Only change status lines and add "Seen again" notes.
5. Run `npm run lint && npm run typecheck && npm test && npm run build` if you changed code.
6. PR titled `chore: friction triage YYYY-MM-DD`, label `agent:nightly`, with a table in the
   body: entry → decision → link. Nothing to fix but issues to file? File them, update the log,
   and still open the PR for the status changes.
7. Follow the `steward` skill. Never merge.
