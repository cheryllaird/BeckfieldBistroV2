# 0008. Ship via agents, with human-approved merges

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Cheryl Laird

## Context

Features are increasingly implemented by Claude agents. `main` deploys straight to production,
the API holds secrets, and `firestore.rules` guards all user data, so agent autonomy needs firm
limits. Agents start each session cold, so knowledge has to live in the repo. Docs and dead code
drift unless someone keeps them in shape.

## Decision

- **Contract:** `AGENTS.md` (loaded by Claude Code through `CLAUDE.md`) holds the rules,
  architecture map and definition of done. Repeatable procedures live as skills in
  `.claude/skills/`; specialist reviewers as subagents in `.claude/agents/`.
- **Memory:** decisions go in `docs/adr/`; obstacles go in `docs/friction-log.md`.
- **Delivery:** agents work on `claude/*` branches and open PRs. CI (lint, typecheck, tests,
  build, secret scan) must pass. A human merges every PR. Agent PRs are authored by the owner's
  GitHub account, so a required GitHub approval is impossible; the merge click is the approval,
  and agents are denied the merge tools.
- **Maintenance:** scheduled Claude Routines run nightly docs and cleanup passes and a weekly
  friction triage. Each opens at most one small PR and never merges.
- **Least privilege:** `.claude/settings.json` denies reading `.env*`, deploying, pushing to
  `main`, force-pushing and merging PRs, and asks before editing security-sensitive files. Agents never hold
  Vercel or Firebase deploy credentials. The `main` branch ruleset is the hard enforcement.

## Consequences

- More PRs to review, but each is small and has a stated scope.
- Friction entries and ADRs become routine parts of a PR.
- Permission rules in `.claude/settings.json` are guardrails, not a sandbox. The branch ruleset
  and the absence of deploy credentials are what actually contain an agent.
- No CODEOWNERS for now: with a single maintainer who is also the PR author it adds nothing.
  Add it, with 1 required approval, if a second reviewer or a separate agent identity appears.

## Alternatives considered

- **Auto-merge low-risk agent PRs:** faster, but a docs-only PR can still change agent
  instructions. Can be revisited once the workflow has a track record.
- **GitHub Actions + API key for nightly agents:** keeps everything in the repo, but puts a paid
  API key in repo secrets. Routines use the existing Claude plan and the Claude GitHub App.
