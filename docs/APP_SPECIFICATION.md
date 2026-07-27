# Beckfield Bistro — Functional Specification

Beckfield Bistro is an AI-powered cooking companion. Its job is to take recipes
from wherever they live — a website, a cookbook photo, a handwritten card, or the
user's own head — and turn them into a connected workflow: a searchable recipe
library, a weekly meal plan, and a smart shopping list that knows what you already
have.

This document specifies **what the app does** — its capabilities, the logic behind
them, and the behaviour that makes it useful. It is deliberately light on layout
and visual design; the focus is functionality: the intelligent extraction, the
ingredient math, the sync model, the offline guarantees, and the rules that make
each feature behave the way it does.

---

## 1. What makes the app distinctive

At a glance, the features that define Beckfield Bistro:

1. **Multi-strategy AI recipe extraction** from web URLs and photos, with graceful
   fallbacks that always try to return a usable recipe rather than failing.
2. **An ingredient normalisation & consolidation engine** that understands that
   "2 finely chopped scallions" and "spring onions, sliced" are the same thing,
   and can add quantities together across recipes.
3. **Shopping-list generation from the meal plan** that scales every recipe to its
   planned servings, merges duplicate ingredients, and **omits pantry staples the
   user already owns**.
4. **Serving-aware scaling** everywhere — recipes, planned meals, and shopping
   quantities all recompute from a servings number.
5. **Conflict-free multi-device sync** — two people (or one person on two devices,
   one of them offline) can edit the same shopping list and both sets of changes
   survive and merge.
6. **Offline-first operation** — the library, planner, list, and pantry all work
   with no connection; changes reconcile when back online.
7. **Bring-your-own AI key** — extraction runs on each user's own (encrypted)
   Gemini API key, so cost and quota belong to them.
8. **Peer-to-peer recipe sharing** by email address.

The rest of this document details each of these.

---

## 2. Core domain concepts

The app manages five kinds of user-owned data. All of it is private to the signed-in
account and syncs across that account's devices.

- **Recipe** — title, source (site/cookbook name), optional source URL, optional
  cover image, optional retained original photo, servings, prep time and total
  time (free-text), an ordered list of method **steps**, and ingredients organised
  into one or more named **sections**. Each ingredient carries a name, a numeric
  quantity, a unit, and the original text line it came from.
- **Meal-plan entry** — a dated entry attaching either a saved recipe, a free-text
  "custom" meal, or a "dining out" note to a specific calendar date, with a
  servings count and an optional meal time (breakfast / lunch / dinner / snack).
- **Shopping-list item** — a line of text, a category, which of the two lists it
  belongs to (**Immediate** or **Stock up**), a checked/in-basket flag, a sort
  order, an optional link back to the **meal sources** that contributed it, and
  (for generated items) a normalised dedup key.
- **Pantry ("Store Cupboard") item** — a staple the user always keeps in stock,
  with a category; used to *exclude* ingredients from generated shopping lists.
- **Recipe share** — a full copy of a recipe addressed to a recipient's email, so
  it appears in their library.

Two derived/config values also belong to the account: the list of **known
recipe sources** (used for source autocomplete) and whether a **Gemini API key**
is on file.

---

## 3. AI recipe extraction

Extraction is the app's headline capability. The user can create a recipe by
pointing at a **URL**, supplying a **photo** (camera or gallery), or typing it in
manually. The URL and photo paths use AI and require the user's Gemini key and a
connection; manual entry always works.

The design principle throughout: **prefer the most faithful source available, and
degrade gracefully so a legible input almost always yields a usable recipe.**

### 3.1 URL extraction — strategy ladder
Given a recipe web address, the app fetches the page and tries, in order:

1. **The page's own structured recipe data** (schema.org/Recipe JSON-LD). This is
   the site's machine-readable recipe, so it is exact to source, instant, free,
   and immune to AI copyright blocks. Most recipe sites publish it. Ingredients,
   steps, yield/servings, and prep/total times are parsed directly (ISO-8601
   durations converted to friendly text).
2. **AI structuring of the page text** — if there is no usable structured data,
   the page's visible text is handed to the model to structure into the recipe
   shape.
3. **A clear failure** — if neither yields a recipe, the user is told to try a
   different URL or enter it manually.

In all cases the app also pulls the page's lead image (from structured data,
`og:image`, or `twitter:image`) to use as the cover, and retains the source URL so
the recipe can link back to the original.

### 3.2 Photo extraction — strategy ladder
Given a photo (of a cookbook page, recipe card, screenshot, or printout), the app
tries, in order:

1. **Direct AI vision** — the model reads the image and returns structured recipe
   data. This is the most accurate transcriber when it isn't blocked.
2. **OCR + AI structuring** — if vision fails or is blocked, the image is
   transcribed **deterministically** with on-device-style OCR (including image
   preprocessing and multi-column reflow), and only the resulting *text* is handed
   to the model to structure. Restructuring handed-over text is faithful and far
   less likely to trip AI copyright filters than transcribing a copyrighted page.
3. **Deterministic local parsing** — if AI is unavailable (e.g. the key is out of
   quota) but OCR produced legible text, a built-in parser structures that text
   into a recipe with no AI at all.
4. **A clear failure** — only if the photo can't be read by either vision or OCR,
   with guidance to take a clearer, well-lit photo of just the ingredients and
   steps, or enter it manually.

The captured photo becomes the recipe's cover image, and a second, leaner copy is
kept as the recipe's **original photo** — so the page the text was read from stays
viewable even after the cover is swapped for a picture of the finished dish.

### 3.3 Faithfulness rules (applies to every AI path)
Extraction is tuned to mirror the source, not "improve" it:

- **Step granularity matches the source:** exactly one step per numbered step or
  paragraph — steps are never split finer or merged coarser than the original,
  and numbered recipes keep their numbering grouping even when a step spans
  several sentences.
- **Ingredient lines are preserved:** the original text of each ingredient is kept
  verbatim (OCR paths fix only obvious character-level scan errors); lines are not
  rewritten, reordered, or normalised at extraction time.
- **Ingredient grouping is preserved:** named groups (e.g. "For the dressing",
  "For the sauce") become named sections; a single unlabeled group stays one
  section.
- **Sensible defaults:** missing fields fall back cleanly (e.g. servings default to
  4, empty strings/arrays elsewhere).

### 3.4 Robust, specific error handling
Each failure mode produces a distinct, actionable message rather than a generic
error: AI **rate-limit / daily-quota exhausted**, AI **temporarily overloaded**,
**copyright-recitation block** (content matches a copyrighted source too closely to
copy), **unreadable photo**, and **unfetchable/invalid URL**. Transient overloads
are retried automatically with backoff; a quota block on the primary model falls
through to a secondary model on its own quota bucket. Manual entry is always
offered as the ultimate fallback.

### 3.5 Extraction is reviewable
Every extraction — however it was produced — lands in the editable recipe form
pre-filled, so the user reviews and corrects before saving. Extraction never
writes a recipe silently.

### 3.6 Bring-your-own key model
Extraction runs on **each user's own Google Gemini API key**:

- The key is entered once in Settings and stored **encrypted server-side**; it is
  never shown back and never crosses the wire on subsequent extraction requests
  (it's looked up and decrypted server-side per request).
- Usage and quota are billed to the user, not shared across all users.
- Without a key, the AI capture modes are unavailable and prompt the user to add
  one (with a link to get a free key); manual entry still works.
- The app tracks, per user's key, that free-tier rate limits exist and surfaces
  quota errors as such.

---

## 4. Recipe library & management

- **Storage:** every recipe the user creates, extracts, or accepts from a share
  lives in their personal library and syncs across devices.
- **Search:** the library is filterable live by **title, source, or any ingredient
  name** — so "what can I make with aubergine?" is answerable.
- **Serving-aware viewing:** on a recipe, a servings control rescales **every
  ingredient quantity live**, rendering results as friendly fractions (½, ¾, ⅓,
  etc.). The scaling ratio is applied from the recipe's base servings.
- **Source memory & autocomplete:** sources the user has used before are
  remembered and offered as autocomplete when entering new recipes.
- **Editing:** any recipe can be edited via the same structured form (sectioned
  ingredients + ordered steps), including multi-section ingredient grouping.
- **Original preserved:** when a recipe was extracted from a photo, the app retains
  the photo the text was read from; when extracted from a URL it retains the source
  link. When an original image exists, the recipe's overflow menu offers — alongside
  Edit — **View original image**, opening it full-screen whether it is hosted or was
  captured in-app. Recipes with no original image simply don't show the entry.
- **Deletion** removes the recipe from the library across all devices (with
  confirmation).

---

## 5. Meal planning

The planner answers "what are we eating, and when?"

- **Three entry types per day:** a **saved recipe**, a **custom** free-text meal
  (not in the library), or a **dining-out** note with an optional location.
- **Meal times:** each entry can be tagged breakfast / lunch / dinner / snack (or
  untimed), and entries on a day are ordered by meal time.
- **Per-entry servings:** each planned meal carries its own servings count,
  independent of the recipe's default — this is what shopping quantities scale to.
- **Add from anywhere:** a recipe can be planned from the library (a quick-plan
  action that pre-selects the next open day), from the recipe detail, or from
  within a day.
- **Move & manage:** planned meals can be moved to a different date, have their
  servings changed, and be removed (with confirmation).
- **Custom → recipe promotion:** a custom (typed) meal can be opened straight into
  the Add-Recipe form pre-filled with its title, to "digitise" it into a real
  recipe.
- **Two time horizons:** a **week view** for active planning (navigable
  week-to-week), and a **month history view** — a glanceable record of what was
  planned on every day, past and future.

---

## 6. The ingredient engine (normalisation & consolidation)

This is the logic that makes the shopping list smart. It runs whenever ingredients
are combined — generating a list from the plan, or adding a single meal to an
existing list.

### 6.1 Unit normalisation
Units are canonicalised so equivalent measures match and combine: grams→g,
kilograms→kg, ounces→oz, pounds→lb, millilitres→ml, litres→l, teaspoons→tsp,
tablespoons→tbsp, cups (plural→singular), etc. **Count-style "units" that carry no
real measure** — clove, piece, each, whole — are treated as *no unit*, so "2 cloves
garlic" and "2 garlic" reconcile.

### 6.2 Name normalisation
Ingredient names are reduced to a canonical form for matching:

- **Singular/plural unified** (tomatoes ↔ tomato).
- **Prep descriptors stripped** — leading ("finely chopped parsley" → parsley,
  "diced onion" → onion) and trailing ("garlic cloves" → garlic, "basil leaves" →
  basil, "lemon wedges" → lemon).
- **Comma clauses dropped** ("broccoli, cut into florets" → broccoli).
- **Juice phrasing folded** ("juice of 1 lemon" and "lemon juice" → lemon) so it
  consolidates with the whole fruit.
- **Regional synonyms unified** — cilantro↔coriander, zucchini↔courgette,
  eggplant↔aubergine, scallion / green onion↔spring onion, arugula↔rocket.

### 6.3 Consolidation
Items sharing the same *(normalised name + normalised unit)* key are merged and
their **quantities summed** (each scaled to its meal's servings first). The merged
line is rendered as "quantity unit name" with the quantity as a friendly fraction
(e.g. "1 ½ cup flour").

### 6.4 Category auto-detection
Every item is auto-assigned to one of ten grocery categories — **Vegetables,
Fruit, Herbs & Spices, Bakery, Meat & Seafood, Dairy & Eggs, Pantry, Frozen,
Beverages, Other** — by keyword matching against a curated ingredient dictionary,
where the most specific keyword match wins (e.g. "cherry tomato" → Vegetables via
the specific match, not a generic one). Categories drive grouping and the
auto-sort order.

### 6.5 Source tracking
Generated/merged items remember **which planned meals contributed them** and in
what scaled quantity, so a shopping item can show a "used in these meals"
breakdown, and re-adding the same meal is idempotent (never double-counts).

---

## 7. Smart shopping list

The list turns the plan into something you actually shop from.

### 7.0 Two lists — Immediate and Stock up
The shopping list is split into **two independent lists the user switches between
with tabs (or a left/right swipe on the list, with a sliding transition)**: an
**Immediate** list for the current shop, and a **Stock up** list for staples to
top up later. Each list keeps its own items, progress, and
"In basket" group, and every shopping action — adding, checking off, reordering,
auto-sorting, and clearing — acts only on the list currently in view; the other
list is left untouched. Items that predate this split (and any item without an
explicit list) belong to **Immediate**, so existing lists carry over unchanged.

### 7.1 Generation from the plan
- The user picks which of the **recipe meals planned across the current and next
  week** to include (all pre-selected; deselect to exclude).
- The engine (§6) scales each recipe to its planned servings, consolidates
  duplicate ingredients across all selected meals, categorises them, and produces
  the list.
- **Pantry exclusion:** any ingredient the user keeps in their **Store Cupboard**
  (§8) is omitted, and the count of skipped staples is shown up front. This is the
  key "don't buy what you already have" behaviour.
- **Targets the Immediate list:** generated items always populate the **Immediate**
  list (replacing its previous contents); the **Stock up** list is never altered by
  generation.

### 7.2 Incremental building
- Individual planned meals can be added to an existing list one at a time; their
  ingredients merge into what's already there (deduping by the same key logic, and
  refusing to add the same meal twice).
- Items can also be **added manually** by typing; manual items are auto-categorised
  from their text and land on the list currently in view (Immediate or Stock up).
- **Pantry exclusion applies to every recipe-derived add** (§8), not just
  generation: adding a single planned meal silently skips its store cupboard
  ingredients. **Manually typed items are always added** — typing is an explicit
  request to buy something, so the cupboard never blocks it.

### 7.3 Shopping & curating
- **Check-off** with running progress (checked/total); checked items collect in an
  "In basket" group.
- **Curate:** rename items, recategorise them (a manual recategorisation is
  remembered as a signal to improve future auto-categorisation), reorder them
  (including one-tap **auto-sort by category**), and remove them.
- **Undo:** list-changing actions (check, remove, edit, sort, reorder) are
  revertible.
- **Meal-source insight:** any generated item can reveal the recipes and scaled
  quantities behind it.

---

## 8. Store Cupboard (pantry)

- A user-maintained list of **staples always in stock** (oils, spices, flour,
  etc.), each auto-categorised.
- Its sole functional purpose: **recipe ingredients matching a pantry item are
  excluded from the shopping list** — whether the list is generated wholesale or a
  single meal is added to it (matched via the same normalised-name logic as §6, so
  "olive oil" in the pantry suppresses "extra-virgin olive oil" from the list).
  Manually typed items are never suppressed.
- Matching also covers **variants of a staple**: qualifiers that describe a kind of
  the same thing ("sea", "flaky", "ground", "fresh", "caster", …) are ignored, so
  "salt" in the cupboard suppresses "sea salt flakes"; and a staple suppresses
  ingredients it heads ("oil" suppresses "sunflower oil"). Staple names that also
  head unrelated ingredients — pepper, butter, cream, milk, onion, sugar, beans,
  peas, corn, squash — match by full name only, so cupboard "pepper" never
  suppresses bell peppers.
- Duplicate staples (by normalised name) are silently prevented.

---

## 9. Recipe sharing

- Any recipe can be sent to **another person by email address** — a full,
  independent copy (images, sectioned ingredients, steps), not a link back to the
  sender's copy.
- **Single or bulk:** one recipe, or many at once to a single recipient.
- **Guardrails:** the recipient email must be well-formed, and a user can't share
  with themselves.
- **Receiving:** shares addressed to the signed-in user's email appear in a
  "Shared with You" inbox. Each can be **saved** (copied into the recipient's own
  library as their own recipe) or **dismissed**, individually or all at once.
- Delivery is account-to-account and shows up whenever the recipient next signs in;
  it doesn't require the two users to be online simultaneously.

---

## 10. Sync & conflict resolution

All user data live-syncs across the account's devices; an edit on one device
appears on another without manual refresh. The functional guarantees:

- **Recency-based merge for most data** (recipes, meal entries, pantry): incoming
  updates are reconciled per-item by which copy is newer, so an edit made on one
  device (or while offline) is never blindly overwritten by a stale copy from the
  server.
- **Field-level, conflict-free merge for the shopping list** — the collection two
  devices most plausibly edit at once. Different aspects of the same item sync
  independently, so **checking an item off on one device and renaming/reordering it
  on another both survive** instead of clobbering each other.
- **Deletion is durable across devices:** a removed item does not resurrect from a
  stale copy (soft-delete tombstones outlive the session), yet an edit made *after*
  a deletion can intentionally bring the item back.
- **No accidental wipes:** a transient "looks empty" read never clears existing
  data — the app waits to confirm a genuine clear before emptying a collection.
- **Account isolation:** switching Google accounts fully clears the previous
  account's data; signing out clears local data for that account.

---

## 11. Offline-first behaviour

- The **library, meal plan, shopping list, and store cupboard** are all fully
  readable and editable **with no connection**. Recipe images are stored locally
  too, so the library is complete offline.
- Changes made offline are queued locally and reconciled when connectivity returns
  (per §10); the app signals offline and "back online — syncing" states.
- **Only** AI extraction (URL/photo) and sharing require a connection; those are
  clearly gated when offline, while manual recipe entry stays available.
- On relaunch the app renders immediately from local data while it re-validates the
  session in the background, and returns to sign-in only if the session is truly
  invalid.
- The app is installable to the home screen and runs standalone, updating itself in
  the background.

---

## 12. Accounts & access

- **Sign-in is Google-only** (with an automatic popup→redirect fallback for
  standalone/PWA contexts). There is no password to manage.
- The Google **name, email, and avatar** identify the user and are the addressing
  mechanism for sharing.
- All data operations are authorised to the signed-in account; a user can only ever
  read and write their own data (and shares addressed to their email).

---

## 13. Capability summary

| Capability | What it does |
|---|---|
| AI URL extraction | Structured-data-first, AI-fallback recipe import from a web link, with cover image |
| AI photo extraction | Vision → OCR+AI → local-parse ladder from a camera/gallery photo |
| Faithful extraction | Preserves step granularity, ingredient wording, and section grouping |
| BYO Gemini key | Per-user, encrypted, self-billed AI usage |
| Recipe library | Private, synced, searchable by title/source/ingredient |
| Serving scaling | Live ingredient rescaling with fraction formatting |
| Meal planner | Recipe / custom / dining-out entries by date and meal time, with per-meal servings |
| Ingredient engine | Unit + name normalisation, synonym folding, quantity consolidation |
| Category detection | Auto-sorts every ingredient into 10 grocery aisles |
| Shopping generation | Scales + consolidates planned meals into one list |
| Dual shopping lists | Separate Immediate and Stock up lists, switchable by tab and managed independently |
| Pantry exclusion | Omits staples the user already owns |
| Meal-source tracking | Shows which meals drove each shopping item; idempotent adds |
| Recipe sharing | Single/bulk copy-share to another user by email, with an inbox |
| Conflict-free sync | Field-level shopping-list merge; recency merge elsewhere; durable deletes |
| Offline-first | Full read/write of library, plan, list, pantry with no connection |
</content>
