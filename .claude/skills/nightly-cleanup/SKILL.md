---
name: nightly-cleanup
description: Nightly legacy-code cleanup for Beckfield Bistro. Run by a scheduled Routine. Picks one small, behaviour-preserving cleanup (dead code, unused exports or deps, stale TODOs, oversized files) and ships it as one PR.
---

# Nightly cleanup pass

You run unattended. Make **one** small, safe, behaviour-preserving improvement as **one** PR, or
nothing. Never merge.

## 1. Set up and survey
```bash
git fetch origin main && git checkout -B claude/nightly-cleanup-$(date +%Y%m%d) origin/main
npm run knip
```
Also grep for `TODO|FIXME|HACK|deprecated|legacy` in `src/` and `api/`. Check open PRs labelled
`agent:nightly` and don't duplicate one still open. Check `docs/friction-log.md` for open
entries that point at confusing code.

## 2. Choose one candidate, in this order of preference
1. Unused exports/types or unused files reported by knip. Confirm with a repo-wide search
   (including tests, `vercel.json`, `index.html`, `scripts/`, docs) that nothing references them.
2. Unused dependencies. Confirm nothing imports them and `vercel.json` `includeFiles` doesn't
   rely on them. `package.json` edits need approval, so if you can't edit it, report it in a
   friction entry instead.
3. Stale TODOs: done, obsolete, or small enough to do.
4. Splitting an oversized module (e.g. `src/store/index.ts`) into slices *without changing
   behaviour*, only if tests cover it well.

## 3. Off limits
Leave alone; report in the PR body or a friction entry instead:
- `firestore.rules`, `firebase.json`, `vercel.json`, `.github/`, `.claude/settings.json`,
  `.claude/hooks/`.
- `api/_utils/auth.ts`, `crypto.ts`, `safeFetch.ts`.
- `api/migrate-bistro.ts` and `api/_utils/legacySync.ts`: legacy but **live** (ADR 0006).
  Removal needs a sunset ADR from a human.
- Root `test-*.ts` scripts: manual smoke checks documented in the README. Only remove one if it
  targets a provider the app no longer uses, and update the README in the same PR.
- Anything that changes user-visible behaviour, data shape or an `api/` contract.

## 4. Do it
- Keep the diff under ~300 lines. Don't mix candidates.
- Run `npm run lint && npm run typecheck && npm test && npm run build`. All must pass.
  A refactor with no test coverage for what it moves: add characterisation tests first, or
  pick another candidate.
- If anything was confusing or blocked you, use the `log-friction` skill.

## 5. Ship
- PR titled `chore(cleanup): <what>` with label `agent:nightly`. Body: what, evidence it's
  unused or dead (search commands and results), why behaviour is unchanged, checks run.
- Follow the `steward` skill for CI. Never merge.
