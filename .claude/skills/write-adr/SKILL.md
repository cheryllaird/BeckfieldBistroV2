---
name: write-adr
description: Write an architecture decision record in docs/adr/ for Beckfield Bistro. Use when a change adds/removes a dependency or service, changes the data model, Firestore paths or rules, an api/ contract or security boundary, introduces a cross-cutting pattern, or reverses an earlier ADR.
---

# Write an ADR

1. Read `docs/adr/README.md` and skim the index for related ADRs. If your decision contradicts
   one, you are superseding it. Say so explicitly.
2. Next number = highest `NNNN-*.md` in `docs/adr/` + 1 (zero-padded to 4).
3. Copy `docs/adr/0000-template.md` to `docs/adr/NNNN-kebab-case-title.md`. Title is the decision
   in the imperative ("Use X for Y").
4. Fill every section:
   - **Status:** `Accepted` (the reviewer's merge accepts it); **Date:** today; **PR:** add once
     the PR exists.
   - **Context:** facts and constraints, with file paths. No advocacy.
   - **Decision:** what, where, and what it applies to.
   - **Consequences:** costs, new obligations, when to revisit.
   - **Alternatives considered:** each real option and why it lost, one or two lines each.
   Aim for under a page.
5. If superseding: change only the old ADR's status line to `Superseded by [NNNN](NNNN-....md)`.
6. Add a row to the index table in `docs/adr/README.md`; update the status of any superseded row.
7. Commit the ADR in the same PR as the change it describes.
