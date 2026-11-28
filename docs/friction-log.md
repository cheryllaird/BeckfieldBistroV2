# Friction log

Anything that slowed down an agent or a human working on this repo: unclear or wrong docs,
flaky or slow tests, missing scripts, confusing code, permission prompts that shouldn't fire,
review loops. It's how the workflow gets better: the weekly `friction-triage` agent turns open
entries into fixes or issues.

**How to add an entry** (or use the `log-friction` skill): add it to the top of the list
below. Be specific and short, and add an entry even when you found a workaround. Never paste
secrets, tokens or user data.

**Merging:** this file merges with `merge=union` (`.gitattributes`), so entries added by
parallel PRs never conflict; git keeps both. That's why **Status** comes straight after the
title: if every entry ended with the same `- **Status:** open` line, git would keep only one copy
of it. Two entries merged this way may end up with no blank line between them, which renders the
same. Entries from before 2026-11-12 still have Status last.

**Statuses:** `open` · `fixed in <PR link>` · `issue <link>` · `wontfix: <reason>`.
Only the triage agent or a human changes a status. Entries are never deleted.

```markdown
### YYYY-MM-DD: short title
- **Status:** open
- **Who:** agent (session/skill) or human
- **Task:** what you were doing, with PR/issue link if any
- **Friction:** what got in the way, and what it cost (time, wrong turn, retries)
- **Suggested fix:** the smallest change that would have prevented it
```

## Entries

### 2026-11-22: No local way to run a workflow's github-script
- **Status:** open
- **Who:** agent (conflict-nudge / pr-sweep session)
- **Task:** adding `.github/workflows/conflict-nudge.yml`
- **Friction:** no `actionlint` or `act`, so the inline script could only be checked by hand
  against a mocked `github` client. Also unclear whether bot comments wake a session subscribed
  to the PR; only a real conflict will tell.
- **Suggested fix:** move non-trivial workflow scripts into `scripts/*.cjs` with a vitest test,
  and add `actionlint` to CI.
### 2026-11-22: URL-import failures left no trace beyond 1-hour runtime logs
- **Status:** fixed in this PR (log-retention note in `docs/recipe-extraction.md` §11; tests added for the URL `url+structured`, `url+gemini` and `urlGemini-bad-json` outcomes)
- **Who:** agent (ship-feature, #244)
- **Task:** diagnose "Could not fetch the recipe page" on a supermarket recipe link (#244)
- **Friction:** URL fetch failures in `api/extract-recipe.ts` returned before `finish()`, so they never reached `analytics/extractionStats`. The only evidence was Vercel runtime logs, which keep 1 hour on the Hobby plan: `get_runtime_logs` with `since: 6h`/`24h` fails with "does not retain runtime logs for the requested time range", and the evidence would have been gone a little later. The URL path also had no handler tests at all (only the photo path), and reproducing the fetch needed a new cloud environment allowing the site's host. The missing analytics and tests are fixed in this PR.
- **Suggested fix:** note the 1-hour log retention (use `since` ≤ 50m) in `docs/recipe-extraction.md` §11 "Testing & debugging", and have friction triage confirm every terminal branch now has a test.
### 2026-11-22: No way to see a page without a signed-in Firebase session
- **Status:** issue https://github.com/cheryllaird/BeckfieldBistroV2/issues/253
- **Who:** agent (ship-feature, issue #240)
- **Task:** checking the Library redesign at phone width (#240)
- **Friction:** every page sits behind Firebase sign-in, so the app can't be run here to look at a UI change. I built a throwaway Vite entry that seeds the store and renders `AppLayout` + the page. Its first try rendered without Tailwind because Vite's root was the harness folder; serving it from the repo root fixed that. About 15 minutes, and the next UI task will redo it.
- **Suggested fix:** commit a dev-only preview entry (e.g. `preview.html` + `src/dev/preview.tsx`, excluded from the build) that renders a chosen page with factory data, and mention it in the `run` notes in AGENTS.md.

### 2026-11-22: frontend-ui guide said the Header hides on scroll
- **Status:** fixed in this PR (#240)
- **Who:** agent (ship-feature, issue #240)
- **Task:** building a toolbar that hides on scroll (#240)
- **Friction:** `.claude/agents/frontend-ui.md` said `Header` hides on scroll-down and reappears on scroll-up. It doesn't, and there was no hook for it, so I went looking for code to reuse that never existed.
- **Suggested fix:** corrected the guide and pointed it to the new `useHideOnScroll` hook.

### 2026-11-19: A `status:ready` issue that depends on an unmerged PR is re-checked every night
- **Status:** fixed in this PR (`build-ready` now skips issues whose dependency isn't on `main` and comments only once)
- **Who:** agent (build-ready nightly routine)
- **Task:** nightly build; #212 skipped again (also on 2026-11-05) because it builds on #211's `shelfOf`, which is still only in open PR #220
- **Friction:** `build-ready` has no rule for ready issues whose dependency hasn't merged, so each run re-reads the issue, re-checks `main` and decides again whether to skip or comment. It also takes one of the 3 nightly slots in the agent's attention while nothing can be built.
- **Suggested fix:** add a line to `.claude/skills/build-ready/SKILL.md`: "If the issue names a dependency that isn't on `main`, skip it silently (comment once, not every night)"; or keep such issues at `status:todo` until the dependency merges.

### 2026-11-14: OCR eval re-runs Tesseract on every change, so tuning reflow/parser is slow
- **Status:** issue https://github.com/cheryllaird/BeckfieldBistroV2/issues/254
- **Who:** agent (cloud session, OCR Phase 2 parser + multi-column reflow)
- **Task:** improving `parseRecipeText` and `reflowColumns` against `npm run eval:ocr` (#223/#228)
- **Friction:** each `eval:ocr` run OCRs every photo again (~1.5 min for 15 photos), although
  the parser and reflow are pure functions of Tesseract's word boxes. Iterating needed a
  hand-written scratch script that cached word boxes once and re-scored in seconds; dozens of
  tuning rounds would otherwise have taken hours.
- **Suggested fix:** give `eval:ocr` a `--cache <file>` option that stores each photo's
  `collectLines` output and raw text on first run and reuses it when the image and
  preprocessing variant are unchanged.

### 2026-11-12: vitest `globals: true` doesn't reach the project configs
- **Status:** fixed in this PR (dropped `globals: true` and the `vitest/globals` type; tests import from `vitest` explicitly)
- **Who:** agent (interactive, ship-feature)
- **Task:** OCR-only eval, https://github.com/cheryllaird/BeckfieldBistroV2/issues/223
- **Friction:** `vitest.config.ts` sets `globals: true` at the root, but the `unit`/`dom` projects
  don't inherit it, so a new test file without `import { describe, it, expect } from 'vitest'`
  fails with "describe is not defined". `tsconfig.test.json` declares `vitest/globals`, so
  typecheck passes and the error only shows at run time. One wasted run. Separately, an earlier
  nightly run of this issue was cut short by three container restarts (see the issue comment).
- **Suggested fix:** either move `globals: true` into each project or drop it plus the
  `vitest/globals` type, so the config states one convention (explicit imports, as every test does).

### 2026-11-12: Every open PR conflicts in the friction log once another merges
- **Status:** fixed in this PR
- **Who:** agent (interactive, steward)
- **Task:** resolving merge conflicts on open PRs #220, #225 and #226
- **Friction:** each PR adds its entry to the top of `docs/friction-log.md`, so merging any one
  left the others conflicting at the same spot. Two rounds of hand-resolving in three days, all
  in this file.
- **Suggested fix:** `merge=union` for the file, with **Status** moved to straight after the
  title so parallel entries don't share their last line.

### 2026-11-11: Nightly cleanup routine names a branch the session can't push to
- **Who:** agent (nightly-cleanup routine)
- **Task:** nightly cleanup, dropping the unused `SLOW_AFTER_MS` export
- **Friction:** the routine prompt and `.claude/skills/nightly-cleanup/SKILL.md` say to use
  `claude/nightly-cleanup-YYYYMMDD`, but the cloud session is told to push only to its own
  designated `claude/<random>` branch. The agent has to pick one; it used the session branch.
- **Suggested fix:** let the skill and routine prompt accept the session's designated branch
  (for example "use the session branch if one is assigned, otherwise claude/nightly-cleanup-YYYYMMDD").
- **Seen again:** 2026-11-16, friction-triage routine: the prompt names `claude/friction-triage-YYYYMMDD`
  while the session is assigned a different `claude/<random>` branch.
- **Status:** fixed in this PR (skills now prefer the assigned branch; the routine prompts live
  outside the repo, so a human should align them)

### 2026-11-11: Subagent worktrees aren't gitignored, so `git add -A` commits them
- **Who:** agent (build-ready, nightly)
- **Task:** building #216 while subagents built #199 and #223 in worktrees
- **Friction:** `Agent` with `isolation: worktree` creates `.claude/worktrees/agent-*` inside the
  repo. `.gitignore` doesn't cover it, so `git add -A` on the main checkout staged both worktrees
  as embedded repos. Fixing the commit needed a force push (refused), so it took a second
  "drop worktree entries" commit.
- **Suggested fix:** add `.claude/worktrees/` to `.gitignore` (done in this PR).
- **Status:** fixed in this PR

### 2026-11-01: Merging a meal into a manual item drops the manual amount
- **Who:** agent (ship-feature)
- **Task:** shopping list preview, issue https://github.com/cheryllaird/BeckfieldBistroV2/issues/209
- **Friction:** `mergeIntoShoppingList` (`src/lib/ingredients/consolidate.ts`) relabels a matched
  item from its `mealSources` only, so a typed "100 g flour" with no sources plus a meal's 200 g
  becomes "200 g flour". A preview test assumed the total and failed; it took a while to see this
  is existing behaviour, not the new code. The preview now shows the same label truthfully.
- **Suggested fix:** decide whether a manual item's own amount should count, and if so fold
  `leadingCount`/amount parsing of the existing name into `labelFor`; file as a bug if it's wrong.
- **Status:** issue https://github.com/cheryllaird/BeckfieldBistroV2/issues/216

### 2026-10-31: `npm run lint` fails after running the dev server
- **Who:** agent (shopping item sheet prototype, PR #195)
- **Task:** screenshot the shopping list in a browser via `vite` dev server
- **Friction:** the PWA plugin writes `dev-dist/` (gitignored) when the dev server runs, but
  `eslint.config.js` only ignores `dist`, so lint then reports 9 errors in generated Workbox
  code. Cost one confused lint run.
- **Suggested fix:** add `'dev-dist'` to `globalIgnores` in `eslint.config.js`.
- **Status:** fixed in this PR

### 2026-10-17: Architectural changes merged while the workflow PR was still open
- **Who:** agent (refreshing the agentic workflow PR)
- **Task:** bring the workflow PR up to date with `main` (#154–#161)
- **Friction:** eight PRs merged before the ADR log existed. Five made architectural choices
  (ingredient engine, recitation policy, account deletion, 90-day expiry, Terms gate) that had
  to be reconstructed from commit messages, and `AGENTS.md` had drifted from the code before it
  even landed.
- **Suggested fix:** merge the workflow PR before the next feature PR, so `ship-feature` and
  the nightly docs agent catch this as it happens.
- **Status:** fixed in this PR (ADRs 0009–0013 back-filled)

### 2026-10-04: Project rules weren't loaded by Claude Code
- **Who:** agent (setting up the agentic workflow)
- **Task:** set up the agent workflow
- **Friction:** rules lived in `.claude/instructions.md` and `.claude/context.md`, which Claude
  Code never loads automatically, and they had drifted from the code (a `src/ai/prompts` folder
  that doesn't exist; a data library that isn't installed). Agents started each session without
  project rules.
- **Suggested fix:** single `AGENTS.md`, imported by `CLAUDE.md`; nightly docs agent checks it
  for drift.
- **Status:** fixed in this PR

### 2026-10-04: Local Node version differs from the project's
- **Who:** agent (setting up the agentic workflow)
- **Task:** set up the agent workflow
- **Friction:** the cloud container ships Node 22 while `package.json` requires Node 24, so
  `npm` warns on every install and local results may differ from CI.
- **Suggested fix:** install Node 24 in the cloud environment's setup script.
- **Seen again:** 2026-10-19 and 2026-10-22, still Node 22.
- **Status:** issue https://github.com/cheryllaird/BeckfieldBistroV2/issues/167

### 2026-10-26: Unused devDependency can't be removed by the nightly cleanup agent
- **Who:** agent (nightly cleanup)
- **Task:** nightly cleanup
- **Friction:** `npm run knip` reports `@tesseract.js-data/eng` (package.json:36) as unused. Nothing
  imports it; OCR loads the committed `api/_tessdata/eng.traineddata.gz` and `vercel.json`
  `includeFiles` doesn't reference the package. Removing it needs a `package.json` +
  `package-lock.json` edit, which the unattended agent can't get approved.
- **Suggested fix:** a human runs `npm uninstall @tesseract.js-data/eng`. Also noted, not touched
  (off limits): `initFirebaseAdmin` in `api/_utils/auth.ts` is an unused export, and the root
  `test-*.ts` smoke scripts show as unused files to knip (consider adding them as knip entries).
- **Status:** issue https://github.com/cheryllaird/BeckfieldBistroV2/issues/217
- **Seen again:** 2026-11-01 and 2026-11-02, same items still reported by knip. 2026-11-02: also dropped the unused `StageName` export (`api/_utils/extractionTiming.ts`). 2026-11-13: same items still reported.
- **Seen again:** 2026-11-11, same items still reported by knip; also dropped the unused `SLOW_AFTER_MS` export (`src/pages/NewRecipe/ExtractionProgress.tsx`).
- **Seen again:** 2026-11-16, same items still reported. Added the root `test-*.ts` smoke scripts as knip entries, so they no longer show as unused files; the devDependency and `initFirebaseAdmin` remain for a human.
- **Seen again:** 2026-11-21, same two items still reported by knip; nothing else left in its report. Removed the unused Vite template images in `src/assets/` instead (knip doesn't scan images).
- **Seen again:** 2026-11-22, same two items still reported, nothing else in knip's report. Split `ShopItem`/`MealSourcesModal` out of `src/pages/ShoppingList/index.tsx` instead.
- **Seen again:** 2026-11-23, same two items still reported. Dropped the unused `FetchFailureKind` type export (`api/_utils/fetchErrors.ts`) instead.
- **Seen again:** 2026-11-26, same two items still reported, nothing else in knip's report. Split `MealChip` and its servings/delete modals out of `src/pages/Plan/DayRow.tsx` instead, with characterisation tests first.
- **Seen again:** 2026-11-27, same two items still reported, nothing else in knip's report. Split the ingredients and method tabs out of `src/pages/RecipeDetail/index.tsx` instead (with new characterisation tests).

### 2026-11-09: Write-path wake was silently throttled away, and lib/firestore.ts had no tests
- **Who:** agent (interactive)
- **Task:** investigating "meal plan made on device A didn't reach device B"
- **Friction:** every write in `src/lib/firestore.ts` calls `ensureFirestoreOnline()`, which reads
  as "every change wakes the connection", but the leading-edge-only throttle dropped every call
  within 10s of the previous wake, so changes made just after resuming got no wake. Nothing
  tested the module itself (only its mock), so the gap wasn't visible.
- **Suggested fix:** done here — trailing-edge wake plus `src/lib/firestore.test.tsx`. More of the
  module's sync behaviour (snapshot guards, error recovery) could use direct tests.
- **Status:** fixed on branch ccr-d0adb988-hav9c9
