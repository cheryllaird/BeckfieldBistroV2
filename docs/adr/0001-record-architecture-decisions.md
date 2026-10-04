# 0001. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Cheryl Laird

## Context

Most changes to this app are now written by AI agents that start every session with no memory
of earlier ones. Without a written record of *why* things are the way they are, an agent will
reasonably "fix" a deliberate choice (e.g. removing the legacy sync, adding a client cache), and
reviewers have to re-explain the same reasoning repeatedly.

## Decision

Record significant decisions as ADRs in `docs/adr/`, using the template and rules in
`docs/adr/README.md`. Decisions already embodied in the code are back-filled as ADRs 0002–0007.

## Consequences

- Agents read the relevant ADRs before changing an area, and write one when they make an
  architectural choice (part of the definition of done in `AGENTS.md`).
- The nightly docs agent keeps the index consistent.
- Small overhead per significant PR; none for ordinary changes.

## Alternatives considered

- **Comments only:** good for local "why", but cross-cutting decisions have no single home.
- **Wiki / external doc:** agents can't see it from a checkout, and it drifts from the code.
