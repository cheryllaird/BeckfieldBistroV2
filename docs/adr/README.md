# Architecture decision records

An ADR is a short note recording one significant decision: the context, what we chose, and
what it costs. They exist so that agents and humans working later understand *why* the code
is shaped the way it is, and don't undo a decision by accident.

## When to write one

Write an ADR (use the `write-adr` skill) when a change:

- adds or removes a runtime dependency, service or hosting component;
- changes the data model, Firestore paths or `firestore.rules`;
- adds or changes an `api/` endpoint's contract or a security boundary;
- introduces a cross-cutting pattern (state, sync, error handling, AI pipeline);
- reverses or changes a previous ADR.

Not needed for: bug fixes, UI tweaks, refactors that keep behaviour and structure, docs.

## Rules

- Copy [`0000-template.md`](0000-template.md) to the next free number: `NNNN-kebab-title.md`.
- ADRs are immutable once accepted. To change a decision, write a new ADR and mark the old
  one `Superseded by NNNN` (that status line is the only edit allowed to an accepted ADR).
- The ADR ships in the same PR as the change it describes. The reviewer's approval accepts it.
- Keep the index below in sync. The nightly docs agent checks it.

## Index

| # | Decision | Status |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-firebase-with-rules-as-security-boundary.md) | Firebase Auth + Firestore, with security rules as the client data boundary | Accepted |
| [0003](0003-vercel-functions-for-privileged-work.md) | Vercel functions in `api/` for privileged and AI work | Accepted |
| [0004](0004-offline-first-store.md) | Offline-first: Firestore listeners → Zustand persisted to IndexedDB | Accepted |
| [0005](0005-ssrf-safe-fetch.md) | Fetch user-supplied URLs only through `safeFetch` | Accepted |
| [0006](0006-shared-bistros.md) | Shared bistros as the unit of data ownership | Accepted |
| [0007](0007-bring-your-own-gemini-key.md) | Per-user Gemini keys, encrypted at rest | Accepted |
| [0008](0008-agentic-delivery-workflow.md) | Ship via agents, with human-approved merges | Accepted |
