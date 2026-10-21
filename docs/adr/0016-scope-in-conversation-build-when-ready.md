# 0016. Scope issues in conversation, build them once the owner marks them ready

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** Cheryl Laird
- **Supersedes:** [0015](0015-scoping-agent-for-notes.md)

## Context

ADR 0015 had an unattended agent turn rough notes into issues overnight. In use, the issues
it wrote were too long to review comfortably, and the owner couldn't steer the scope as it was
being written. Filing a note through a form was also slower than simply asking Claude. What the
owner wants is to scope work *with* Claude, then approve it, then have an agent build it.

## Decision

- **Scope in conversation:** the `scope-issue` skill runs in an ordinary session ("create an
  issue for …"). It investigates the code (`tech-scoper`, `bug-investigator`), has
  `scope-critic` challenge the ask, asks the owner one or two rounds of focused questions,
  shows a short draft (why, what, acceptance criteria, notes for the builder), and files it
  labelled `status:todo` plus a `type:*` label.
- **Human gate:** the owner adds `status:ready`. Only people with write access can label, so
  the label is the approval. Agents never set it.
- **Build:** the `build-ready` skill builds each `status:ready` issue as its own PR through
  `ship-feature`. A nightly Routine runs it for up to 3 issues; it also runs on request.
  Labels move `status:in-progress` → `status:in-review`. An issue that turns out ambiguous goes
  back to `status:todo` with a question.
- The Quick note form, the `scope-notes` skill, its nightly Routine and the `triage:*` labels
  are removed. The `product-scoper` subagent is dropped; the conversation with the owner
  covers the product side.

## Consequences

- Scoping needs the owner present, so nothing gets scoped unattended.
- Up to 3 agent PRs a night to review, each tied to an issue the owner approved.
- The board stays a label-grouped view; there's no Projects API access (see ADR 0015).
- Issues filed by agents (for example by `friction-triage`) arrive as `status:todo`, so they
  pass the same gate.

## Alternatives considered

- **Keep the overnight scoper with a shorter format:** still no chance to challenge or clarify
  with the owner while scoping.
- **Project Status field as the gate:** agents can't read Projects, so it would need an Action
  and a `project`-scoped token.
- **Build on demand only:** simpler, but approved issues would wait until the owner asked.
