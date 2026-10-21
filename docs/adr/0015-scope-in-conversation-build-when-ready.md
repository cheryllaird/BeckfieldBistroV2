# 0015. Scope issues in conversation, build them once the owner marks them ready

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** Cheryl Laird

## Context

The agentic workflow (ADR 0008) takes a well-described request to a PR (`ship-feature`), but
ideas and bug hunches start as rough one-liners. They need scoping before anyone builds them,
and the owner wants to steer that scoping, not review long specs written unattended. An
earlier attempt, where a nightly agent scoped notes on its own, produced issues too long to
review and gave the owner no chance to challenge or clarify. The GitHub tools agents use expose
issues, labels, sub-issues and PRs, but not GitHub Projects.

## Decision

- **Scope in conversation:** the `scope-issue` skill runs in an ordinary session ("create an
  issue for …"). It investigates the code (`tech-scoper`, `bug-investigator`), has
  `scope-critic` challenge the ask, asks the owner one or two rounds of focused questions,
  shows a short draft (why, what, acceptance criteria, notes for the builder), and files it
  labelled `status:todo`, with its GitHub issue type set (Feature, Bug or Task).
- **Human gate:** the owner adds `status:ready`. Only people with write access can label, so
  the label is the approval. Agents never set it.
- **Build:** the `build-ready` skill builds each `status:ready` issue as its own PR through
  `ship-feature`. A nightly Routine runs it for up to 3 issues; it also runs on request.
  Labels move `status:in-progress` → `status:in-review`. An issue that turns out ambiguous goes
  is labelled `status:needs-attention` with a question.
- **Board:** a GitHub Project is only a view over the issues, grouped by label; agents never
  use the Projects API.

## Consequences

- Scoping needs the owner present, so nothing gets scoped unattended.
- Up to 3 agent PRs a night to review, each tied to an issue the owner approved.
- Issues filed by agents (for example by `friction-triage`) arrive as `status:todo`, so they
  pass the same gate.
- The board has no Status field sync. If one is wanted later, it needs an Action with a
  `project`-scoped token as a repo secret, which needs its own decision.

## Alternatives considered

- **Nightly agent scopes rough notes on its own:** tried first; issues came out verbose and
  the owner couldn't steer them.
- **Project Status field as the gate:** agents can't read Projects, so it would need an Action
  and a `project`-scoped token.
- **Build on demand only:** simpler, but approved issues would wait until the owner asked.
