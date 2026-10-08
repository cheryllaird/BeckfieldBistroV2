# Agentic delivery workflow

How features get from an idea to production through Claude agents, and what keeps that safe.
The decision behind it is [ADR 0008](adr/0008-agentic-delivery-workflow.md).

## The loop

1. **Ask.** Describe the feature in a Claude Code session on this repo (web, desktop or CLI),
   or in a GitHub issue. Say "use the ship-feature skill" or just describe the work: the skill
   triggers on feature requests.
2. **Build.** The agent reads `AGENTS.md`, the spec and relevant ADRs, then plans, implements,
   tests and runs every check. It writes an ADR if it made an architectural choice and a friction
   entry if something got in its way. It uses the `security-reviewer` subagent when it touches
   `api/`, auth or `firestore.rules`.
3. **PR.** The agent pushes a `claude/*` branch and opens a PR from the template. It watches CI
   and review comments and fixes them (the `steward` skill).
4. **Review.** CI must be green. You read the diff. Agent PRs are opened under your GitHub
   account, so GitHub won't let you "approve" them; **your merge click is the approval**, and
   agents are blocked from merging (see Guardrails). Look hardest at PRs the template marks as
   touching security-sensitive paths.
5. **Ship.** You merge. Vercel deploys `main`; the version bump runs automatically.
   `firestore.rules` changes are deployed by you, by hand (see README).

## The two logs

- **ADR log** (`docs/adr/`): *why* the code is shaped this way. Read before changing an area;
  supersede rather than contradict.
- **Friction log** (`docs/friction-log.md`): *what slows work down*. Every agent adds to it; the
  weekly triage turns it into fixes. If the same friction keeps appearing, that's the most
  valuable thing to fix next.

## Nightly and weekly agents (Claude Routines)

Each runs in a fresh cloud session on `main`, follows one skill, opens **at most one** PR
labelled `agent:nightly`, and never merges. If there's nothing worth doing, it does nothing.

| Routine | Skill | When (UK time) | What it does |
|---|---|---|---|
| Nightly docs | `nightly-docs` | 01:47 daily | Checks the last day's merges against the docs, ADR index and `AGENTS.md`; fixes drift in a docs-only PR |
| Nightly cleanup | `nightly-cleanup` | 02:47 daily | Picks one small, behaviour-preserving cleanup from the `knip` report or legacy/TODO markers |
| Friction triage | `friction-triage` | Mondays 07:47 | Fixes cheap open friction entries; files issues for the rest |

Manage them at claude.ai/code → Routines (pause, edit the prompt, run now), or ask Claude in
any session to list, pause or update them.

## Guardrails

| Layer | What it does | Where |
|---|---|---|
| Rules | What agents must and must never do | `AGENTS.md` |
| Permissions | Deny reading `.env*`, deploying, pushing to `main`, force-push, merging PRs; ask before editing rules, workflows, `vercel.json`, `package.json`, auth/crypto/safeFetch | `.claude/settings.json` |
| No deploy credentials | Agents never get Vercel or Firebase deploy tokens; Routines have no connectors | Routine/environment config |
| CI | Lint, typecheck, tests, build, secret scan; `npm audit` and `knip` reports | `.github/workflows/ci.yml` |
| PR template | Every PR states its ADR, friction entry, sensitive paths touched and test evidence | `.github/pull_request_template.md` |
| Branch ruleset | The hard stop: nothing reaches `main` without a PR, green checks and your approval | GitHub settings (below) |

Permission rules are a guardrail, not a sandbox: a determined command can route around a prefix
rule. The branch ruleset and the missing deploy credentials are what actually contain an agent.

If you later add a second human reviewer, or give agents their own GitHub identity, raise the
ruleset to 1 required approval and add a `CODEOWNERS` file for `firestore.rules`, `api/`,
`.github/` and `.claude/`.

## One-time GitHub setup (do this by hand)

1. **Settings → Rules → Rulesets → New branch ruleset** targeting `main`:
   - Require a pull request before merging, with **0** required approvals (agent PRs are
     authored as you, and you can't approve your own PR; the merge itself is your approval).
   - Require status checks: `check` and `secret-scan`.
   - Block force pushes; restrict deletions.
   - **Bypass list: add the GitHub Actions app.** `bump-version.yml` pushes the version bump
     straight to `main` and would fail without the bypass.
2. **Settings → Code security:** enable secret scanning and push protection, Dependabot alerts.
3. **Labels:** create `agent:nightly` (the Routines use it; they'll create it if missing).
4. Optional: install the Claude Code Review GitHub app for an automated reviewer on every PR.
