---
name: log-friction
description: Add an entry to docs/friction-log.md when something slowed down work on Beckfield Bistro: unclear or wrong docs, flaky or slow tests, missing scripts, confusing code, unhelpful permission prompts, repeated review loops. Use before finishing any task where you hit friction, even if you worked around it.
---

# Log friction

1. Open `docs/friction-log.md`. Check for an existing **open** entry about the same thing. If
   there is one, add a dated bullet under it ("Seen again YYYY-MM-DD: …") instead of a new entry.
   Repeats are the strongest signal for triage.
2. Otherwise insert a new entry at the **top** of the `## Entries` section, in this format:
   ```markdown
   ### YYYY-MM-DD: short title
   - **Who:** agent (<skill or task>) or human
   - **Task:** what you were doing, with PR/issue link if any
   - **Friction:** what got in the way, and what it cost
   - **Suggested fix:** the smallest change that would have prevented it
   - **Status:** open
   ```
3. Be specific: file paths, command, error text (trimmed). One entry per distinct problem.
4. Never include secrets, tokens, environment values or user data.
5. If the fix is trivial and inside your task's scope, fix it, and set the status to
   `fixed in this PR`.
