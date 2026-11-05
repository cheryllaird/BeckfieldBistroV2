# 0018. Group Pantry items by a derived shelf

- **Status:** Accepted
- **Date:** 2026-11-05
- **Deciders:** Cheryl Laird
- **PR:** see issue #211

## Context

Most store cupboard items, and many shopping list items, land in the Pantry category, so a big
cupboard is one long undifferentiated group. The 10 aisle categories are stored on items and
remembered per ingredient in `categoryOverrides` (ADR 0009); older app versions read and write
them.

## Decision

- Pantry items also have a **shelf** (`PantryShelf`: Oils & Vinegars, Condiments & Sauces, Pasta,
  Rice & Grains, Tins & Jars, Baking, Nuts, Seeds & Dried Fruit, Spreads & Syrups, Other pantry).
  The 10 categories are unchanged.
- The shelf is **derived from the ingredient name** by `shelfOf(name, shelfOverrides)` in
  `src/lib/ingredients/shelves.ts`, using the same most-specific-match rules as `categorize()`.
  It is never stored on items, so there is no backfill and no recency race (ADR 0016).
- Household choices live in a new `bistros/{id}/shelfOverrides` collection, one doc per
  `categoryKey` (`{ ingredientKey, shelf, updatedAt }`), mirroring `categoryOverrides`. A separate
  collection means an older client that rewrites or deletes a category override cannot wipe a
  shelf choice. Choosing the worked-out shelf again deletes the doc.
- `firestore.rules` is unchanged: the existing `bistros/{bid}/{collection}/{document=**}` member
  rule covers it. Account deletion (ADR 0011) uses `recursiveDelete` on the bistro and user
  documents, which removes subcollections, so no change to `api/delete-account.ts` is needed.
  The docs hold ingredient names only, no personal data.
- The two identical `categoryOrder.ts` files are merged into `src/lib/ingredients/categoryOrder.ts`
  (`CATEGORY_ORDER`, `categoryRank`: unknown categories sort last).
- Shopping list Auto sort orders by category, then Pantry items by shelf.

## Consequences

- Older app versions ignore shelves and keep working unchanged.
- Changing a keyword regroups items immediately; saved choices are keyed by ingredient, so they
  survive.
- Cupboard headings by shelf are a separate piece of work (#212).

## Alternatives considered

- **Store the shelf on each item:** needs a backfill and merges by recency across devices.
- **Add shelves as new top-level categories:** older clients would not know them and the
  categories are stored on items.
- **Keep shelf choices inside `categoryOverrides` docs:** older clients rewriting a category
  override would drop the shelf.
