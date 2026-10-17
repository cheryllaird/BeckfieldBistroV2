---
name: ship-feature
description: End-to-end procedure for shipping a feature, enhancement or non-trivial bug fix in Beckfield Bistro as a reviewed pull request. Use whenever asked to build, add, implement or change app behaviour.
---

# Ship a feature

You deliver a PR that a human can review in minutes and merge with confidence. You never merge,
deploy or push to `main`.

## 1. Understand
- Read `AGENTS.md` (rules, architecture map, definition of done).
- Read the relevant sections of `docs/APP_SPECIFICATION.md` and any ADR in `docs/adr/` that
  covers the area. Extraction work: read `docs/recipe-extraction.md`.
- Read the existing code you'll touch and its tests. Reuse helpers in `src/lib/`, `api/_utils/`,
  `src/components/ui/` rather than writing new ones.
- If the request is ambiguous in a way that changes what you build, ask. Otherwise choose the
  conventional option and say so in the PR.

## 2. Plan
- Write a short plan: files to change, data/API changes, tests, docs.
- Architectural choice (new dependency, data model, Firestore paths, `api/` contract, security
  boundary, cross-cutting pattern)? Write an ADR first with the `write-adr` skill.
- Touching `firestore.rules`, `api/`, auth, crypto or `safeFetch`? Mark it in the plan and the PR,
  and run the `security-reviewer` subagent before opening the PR.

## 3. Build
- Branch: `claude/<short-kebab-name>` (or the branch you were given).
- Follow `AGENTS.md` rules. UI work: delegate to or follow the `frontend-ui` subagent.
- Write tests alongside the code (`test-writer` subagent can help): logic in `*.test.ts`,
  components/hooks/store in `*.test.tsx`, data from `src/test/factories.ts`.
- Small, focused commits with descriptive messages.

## 4. Verify
Run all four and fix every failure:
```bash
npm run lint && npm run typecheck && npm test && npm run build
```
For visible UI changes, run the app (`run` skill) and check the flow at mobile width.
Then re-read your full diff as a hostile reviewer: what would break, leak or confuse?

## 5. Document
- Update the spec, README, `docs/recipe-extraction.md` or `AGENTS.md` if what they describe
  changed. Update the ADR index if you added an ADR.
- Anything slowed you down? Add an entry with the `log-friction` skill. Be honest and specific.

## 6. Open the PR
- Push with `git push -u origin <branch>`.
- Open the PR with `.github/pull_request_template.md` filled in: summary, ADR link or "none",
  friction entry or "none", sensitive paths touched, test evidence (commands + results).
- Then follow the `steward` skill until CI is green and review comments are addressed.
