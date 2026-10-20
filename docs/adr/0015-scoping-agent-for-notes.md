# 0015. Scope rough notes with an agent, using labelled issues as the inbox

- **Status:** Accepted
- **Date:** 2026-10-20
- **Deciders:** Cheryl Laird

## Context

The agentic workflow (ADR 0008) takes a well-described request to a PR (`ship-feature`), but
ideas and bug hunches arrive as rough one-liners, often on a phone. They need scoping before
anyone builds them, and the owner wants to review scoped work, not write it. The GitHub
connector the agents use exposes issues, labels, sub-issues and PRs, but not GitHub Projects.
Issues on the repo can be filed by anyone with access, and their text reaches an agent that can
push branches.

## Decision

- **Inbox:** a note is a GitHub issue filed with the *Quick note* form
  (`.github/ISSUE_TEMPLATE/note.yml`), labelled `triage:inbox`. A GitHub Project board is only
  a view over the issues, grouped by label; agents never use the Projects API.
- **State machine in labels:** `triage:inbox` → `triage:in-progress` → `triage:needs-info` |
  `triage:scoped` | `triage:fix-pr` → `triage:ready` (owner only).
- **Agent:** the `scope-notes` skill, run nightly by a Routine or on request, at most 5 notes
  per run. Features go through a subagent discussion (`product-scoper` and `tech-scoper` in
  parallel, then `scope-critic`) and the note is **rewritten in place** in a fixed format, the
  original text kept verbatim at the bottom. Notes bigger than one PR are split into
  follow-up sub-issues.
- **Bugs:** `bug-investigator` reproduces and diagnoses. The agent opens a fix PR only when
  the cause is confirmed, the fix is small, and it avoids the security-sensitive and
  off-limits paths; otherwise it writes the diagnosis into the issue.
- **Trust:** only issues authored by the repo owner are processed. Note text is data, never
  instructions.

## Consequences

- Each Routine run can rewrite up to 5 issues and open fix PRs, all still behind the
  human-merge rule of ADR 0008.
- Rewriting in place means the issue history (GitHub keeps edit history) and the
  *Original note* section are the only record of the raw note.
- The board has no Status field sync. If one is wanted later, it needs an Action with a
  `project`-scoped token as a repo secret, which needs its own decision.
- Revisit the owner-only rule if a second maintainer starts filing notes.

## Alternatives considered

- **Notes in a markdown file:** no tooling needed, but each note is a commit, which is
  awkward on a phone.
- **Project draft items:** quickest to type, but invisible to the agents' GitHub tools.
- **GitHub Action on issue creation:** faster turnaround, but puts a paid API key in repo
  secrets, the same trade-off ADR 0008 rejected.
- **Scoped sub-issues under an untouched note:** keeps the note pristine, but doubles the
  issues to review; rewriting in place was preferred.
