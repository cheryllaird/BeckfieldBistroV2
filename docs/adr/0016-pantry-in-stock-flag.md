# 0016. Track whether a store cupboard item is in stock

- **Status:** Accepted
- **Date:** 2026-10-22
- **Deciders:** Cheryl Laird
- **PR:** see issue #184

## Context

The store cupboard holds staples the household always has, and every staple is skipped when
meals are added to the shopping list (ADR 0009). When one runs out it keeps being skipped, so
the user has to remove it from the cupboard (losing its name and category) or retype it on the
list. `PantryItem` documents are synced and merged by `updatedAt` recency (spec §10);
`firestore.rules` does not validate cupboard fields.

## Decision

- Add an optional `inStock?: boolean` to `PantryItem`. A missing value means in stock, so
  existing documents need no migration.
- `findPantryMatch` ignores items with `inStock === false`, so out-of-stock staples are no
  longer skipped when meals are added or a list is generated.
- `setPantryItemStock(id, inStock)` in the store writes the flag and stamps `updatedAt`, so it
  syncs and merges like any other cupboard edit (last writer wins per item).
- The flag is personal-data-free (a boolean on a document account deletion already removes),
  so ADR 0011 and 0012 are unaffected.

## Consequences

- One flag covers both the add-meal and generate-list paths, because both go through
  `findPantryMatch`.
- Ticking an item off the shopping list does not restock it; the user switches it back by hand.
- Older app versions ignore the field and keep skipping the item until they update.
- Cupboard reorder detection (`pantryContentEqual`) now treats a stock change as a content change.

## Alternatives considered

- **Remove the item from the cupboard when it runs out:** loses name and category and has no
  way back to "always in stock".
- **Restock automatically when ticked off the list:** guesses intent; left out of scope.
