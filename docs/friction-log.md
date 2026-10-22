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
