# Friction log

Anything that slowed down an agent or a human working on this repo: unclear or wrong docs,
flaky or slow tests, missing scripts, confusing code, permission prompts that shouldn't fire,
review loops. It's how the workflow gets better: the weekly `friction-triage` agent turns open
entries into fixes or issues.

**How to add an entry** (or use the `log-friction` skill): add it to the top of the list
below. Be specific and short, and add an entry even when you found a workaround. Never paste
secrets, tokens or user data.

**Statuses:** `open` · `fixed in <PR link>` · `issue <link>` · `wontfix: <reason>`.
Only the triage agent or a human changes a status. Entries are never deleted.

```markdown
### YYYY-MM-DD: short title
- **Who:** agent (session/skill) or human
- **Task:** what you were doing, with PR/issue link if any
- **Friction:** what got in the way, and what it cost (time, wrong turn, retries)
- **Suggested fix:** the smallest change that would have prevented it
- **Status:** open
```

## Entries

### 2026-11-11: Nightly cleanup routine names a branch the session can't push to
- **Who:** agent (nightly-cleanup routine)
- **Task:** nightly cleanup, dropping the unused `SLOW_AFTER_MS` export
- **Friction:** the routine prompt and `.claude/skills/nightly-cleanup/SKILL.md` say to use
  `claude/nightly-cleanup-YYYYMMDD`, but the cloud session is told to push only to its own
  designated `claude/<random>` branch. The agent has to pick one; it used the session branch.
- **Suggested fix:** let the skill and routine prompt accept the session's designated branch
  (for example "use the session branch if one is assigned, otherwise claude/nightly-cleanup-YYYYMMDD").
- **Status:** open

### 2026-11-05: Ready issues depend on unmerged work and ADR numbers collide
- **Who:** agent (build-ready)
- **Task:** nightly build of #175 and #211
- **Friction:** #175 says "build after #198" and #212 says "after #211", but both prerequisites
  are open PRs, not on `main`, while the issues carry `status:ready`. The skill says to branch from
  `main`, so #175 will conflict with PR #215 and #212 had to be skipped. Open PRs also reserve
  the next ADR number (#215 uses 0017), so parallel PRs pick numbers by guesswork.
- **Suggested fix:** list prerequisites as `Blocked by #n` and have build-ready skip issues whose
  blockers are still open; reserve ADR numbers in the PR title or pick `max(main, open PRs) + 1`.
- **Status:** open

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
- **Seen again:** 2026-11-01 and 2026-11-02, same items still reported by knip. 2026-11-02: also dropped the unused `StageName` export (`api/_utils/extractionTiming.ts`).
- **Seen again:** 2026-11-11, same items still reported by knip; also dropped the unused `SLOW_AFTER_MS` export (`src/pages/NewRecipe/ExtractionProgress.tsx`).

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
