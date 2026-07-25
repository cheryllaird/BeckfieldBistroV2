# Beckfield Bistro — Product Specification

Beckfield Bistro is an AI-powered "culinary companion" — a mobile-first web app
(installable as a PWA) that helps a household digitise recipes, plan meals across
a calendar, and turn that plan into a smart, categorised shopping list. Everything
a user creates is private to their account, syncs live across their devices, keeps
working offline, and can be shared recipe-by-recipe with other people by email.

This document specifies the **user-facing experience** feature by feature. It is
written so that an engineer (or Claude Code) could rebuild the app from scratch.
It deliberately avoids prescribing internal implementation, but it does describe
observable behaviour precisely — including offline behaviour, sync behaviour, and
every screen, control, and state a user can reach.

---

## 1. Product overview

- **Who it's for:** A person or household who cooks from a mix of sources
  (websites, cookbook photos, handwritten cards, their own head) and wants one
  place to store recipes, decide what to eat each day, and shop for it.
- **Platform:** Mobile-first responsive web app, constrained to a narrow
  phone-width column (max ~28rem/448px) centred on larger screens. Installable to
  the home screen as a Progressive Web App and usable in standalone (full-screen)
  mode.
- **Look & feel:** Warm, friendly, "bistro" aesthetic. Off-white/slate
  backgrounds, rounded cards (generous corner radius), soft shadows, and an
  **amber/gold accent** used for primary actions, active states, and highlights.
  Dark "ink" background on the splash and sign-in screens. Emoji and simple line
  icons throughout. Subtle enter/slide-up/fade animations on screens and modals.
- **Core objects:** Recipes, Meal-plan entries, Shopping-list items, Store-cupboard
  (pantry) items, and Recipe shares.
- **Primary navigation:** A fixed bottom tab bar with three tabs — **Recipes**,
  **Plan**, **List** — plus a top header with the brand and a profile menu.

---

## 2. Onboarding, authentication & session

### 2.1 Splash screen
- On every cold start the app shows a branded splash: dark background, the
  Beckfield Bistro logo, the app name, the tagline "Entering the Bistro…", and
  three pulsing amber loading dots.
- The splash remains until the app is ready to decide what to show (a minimum of
  ~2.2 seconds, and until stored data has loaded and the sign-in state is known).

### 2.2 Sign in
- Authentication is **Google Sign-In only**. There is no email/password or
  username flow.
- The sign-in screen shows the logo, app name, the tagline "Your AI culinary
  companion", a "Sign in to continue" prompt, and a single **Continue with
  Google** button (with the Google "G" icon).
- Tapping it opens the Google sign-in popup. If the popup is blocked (common in
  installed/standalone PWA mode) the app automatically falls back to a full-page
  redirect sign-in.
- If the user dismisses the Google popup, nothing happens (it is not treated as an
  error). Genuine failures show a concise, human-readable error message beneath
  the button (e.g. network problems, unauthorized domain, account disabled).
- A footer notes agreement to Terms of Service and Privacy Policy.
- After a successful sign-in the user lands on their **Recipes** library.

### 2.3 Identity & profile menu
- The user's Google **display name, email, and avatar** are used across the app.
- The top-right of the header shows the avatar (or a fallback user icon) and the
  user's first name. Tapping it opens a menu showing full name, email, the app
  version number, and two actions: **Settings** and **Sign out**.

### 2.4 Session persistence & multi-device
- A signed-in session persists across app restarts. On relaunch the app renders
  immediately from locally-stored data (see Offline, §9) while it silently
  re-validates the session in the background.
- If the background check finds the session is no longer valid (token revoked,
  expired, account deleted/disabled elsewhere), the app quietly returns the user
  to the sign-in screen rather than leaving them in a broken state.
- **Signing out** clears all locally-held data for that account from the device.
- **Switching accounts** (a different Google user signs in) fully clears the
  previous account's data so nothing bleeds between accounts.
- All of a user's data is **private to their account** and **live-synced across
  every device** they're signed into (see §10 Sync).

---

## 3. App shell & navigation

### 3.1 Layout
- **Header (sticky, top):** brand wordmark on the left; profile menu on the right.
- **Bottom navigation (fixed):** three tabs, each with an icon and label:
  - **Recipes** (book icon) → the recipe library
  - **Plan** (calendar icon) → the meal planner
  - **List** (cart icon) → the shopping list
  - The active tab is highlighted in amber with a soft amber pill background.
- **Content area:** scrolls between header and bottom nav; navigating to a new
  screen scrolls back to the top.
- The **Store Cupboard (Pantry)** and **Settings** screens are reachable from
  within other screens (not from the bottom tabs).

### 3.2 Network status banner
- A thin banner appears directly under the header to reflect connectivity:
  - **Offline:** dark banner — "You're offline — meal plan and shopping list
    still work" with an offline icon.
  - **Just reconnected:** green banner — "Back online — syncing your changes" with
    a wifi icon, shown briefly after connectivity returns.
  - When online and stable, no banner is shown.

---

## 4. Recipes

Recipes are the heart of the app. A recipe has: a title; a source (site/cookbook
name); an optional source URL; an optional cover image; servings; prep time and
total time (free-text like "15 mins"); ingredients (organised into one or more
named **sections**, each ingredient having a name, quantity, unit, and the
original text line); and an ordered list of method **steps**. Recipes may also
retain the original photo they were extracted from.

### 4.1 Recipe library (Recipes tab)
- Header "My Recipes" with an **Add Recipe** button (plus icon).
- A **search box** filters the library live by title, source, **or ingredient
  name**. A clear (✕) button appears while searching, and a "N results for …"
  count is shown.
- Recipes are shown as a **two-column grid of cards**, newest first. Each card
  shows the cover image (or a utensils placeholder if none), the title (up to two
  lines), the source, the servings count, and the total time (if set).
- Each card has a **quick-plan button** (calendar-plus, top-right of the image)
  that opens the date picker to add that recipe to the plan without opening it
  first (see §4.6).
- Tapping a card opens the **Recipe detail** screen.
- **Empty state:** a friendly "Your library is empty" message with a "🍳" emoji
  and an "Add your first recipe" button. When a search returns nothing: "No
  recipes found — Try a different search term."

#### 4.1.1 Incoming shares inbox
- When other users have shared recipes to this account's email, a **"Shared with
  You"** section appears at the top of the library with a count badge.
- It lists incoming shares (first 3, with an "and N more…" expander). Each share
  card shows the recipe thumbnail, title, and "From <sender name>", plus **Save**
  and **Dismiss** buttons.
- Section-level **Save All** and **Dismiss All** buttons handle every pending
  share at once, with in-progress labels ("Saving…", "Dismissing…").
- **Save** copies the recipe into the user's own library; **Dismiss** discards the
  share. Either way it disappears from the inbox. (See §7 Sharing.)

#### 4.1.2 Bulk selection & sharing
- **Long-pressing** a recipe card enters **selection mode**: a checkbox appears on
  each card, and a bottom action bar shows "N selected", a cancel (✕), and a
  **Share N** button.
- Tapping cards toggles their selection. The hardware/browser **Back** gesture
  cancels selection mode instead of navigating away.
- **Share N** opens the bulk-share modal to send all selected recipes to one email
  address (see §7.2).

### 4.2 Adding a recipe — capture modes
The **Add Recipe** screen offers three ways to create a recipe, chosen via a
segmented control: **URL**, **Photo**, and **Manual**.

- **URL** and **Photo** are AI-powered extraction paths and require an internet
  connection **and** a saved Gemini API key (see §11 Settings). When offline,
  those two modes are visually disabled with a tooltip/among an explanation, and
  only **Manual** is available.
- If the user has no Gemini key saved, URL and Photo modes show a prompt: "Add
  your Gemini API key to extract recipes" with a shortcut button to Settings.

#### 4.2.1 URL extraction
- The user pastes a recipe web address and taps **Extract Recipe**.
- The app fetches and reads the page and pre-fills the recipe form with the
  extracted title, source, servings, prep/total time, ingredient sections, method
  steps, and — when the page provides one — a cover image. The source URL is
  retained so the recipe detail can link back to the original.
- While working, the button shows "Extracting…". On success the app switches to
  the editable form (Manual view) pre-filled so the user can review and adjust
  before saving.
- Clear error messages are shown for: an unreachable/invalid page, a page with no
  usable recipe, the AI service being rate-limited or overloaded, or a recipe that
  can't be copied for copyright reasons — in which case the user is told to enter
  it manually.

#### 4.2.2 Photo extraction
- The user can **Take Photo** (opens an in-app camera) or choose **From Gallery**
  (file picker).
  - **Camera:** a full-screen live camera view using the rear/environment camera,
    with a large shutter button and a cancel (✕). Handles "camera not supported"
    and "permission denied" with helpful messages and a way back.
  - After capture/selection, an **image cropper** lets the user frame the recipe
    before extraction.
- The cropped photo is analysed by AI and the form is pre-filled just like the URL
  path. During analysis the drop zone shows "Analysing photo…" with a spinner.
- The captured photo also becomes the recipe's cover image.
- Extraction is robust: it reads printed pages, cookbook photos, handwritten
  cards, and screenshots. If the AI can't read the photo, the user gets a clear
  message suggesting a clearer, well-lit photo of just the ingredients and steps,
  or manual entry.

#### 4.2.3 Manual entry
- The full recipe form (see §4.3), starting blank (servings default 4). Always
  available, including fully offline.

### 4.3 Recipe form (create & edit)
The same form is used for manual creation, reviewing an AI-extracted draft, and
editing an existing recipe.

- **Title** (required).
- **Source** free-text with **autocomplete suggestions** drawn from the user's
  previously-used sources.
- **Servings** (required, minimum 1), **Prep Time** (free text), **Total Time**
  (free text) laid out in a row.
- **Cover image:**
  - If present, shows a preview with a remove (✕) button.
  - "Add Cover Photo / URL" (or "Replace…") expands to two choices: **Take Photo**
    (camera → cropper) or **Enter URL** (paste an image address). A broken image
    URL falls back to a placeholder icon.
- **Ingredients**, organised into **sections**:
  - Each section has an optional name (e.g. "For the dressing"). With multiple
    sections, section names are visually grouped with an amber left border.
  - Each ingredient row has three fields: **name**, **quantity** (numeric), and
    **unit**, plus a delete button.
  - "Add Ingredient" adds a row to a section; "Add Section" adds a new named
    section. Sections beyond the first can be removed.
- **Method:** an ordered list of steps, each a multi-line text area numbered
  automatically, with add/remove controls.
- **Actions:** **Cancel** and **Save Recipe**. Validation blocks saving without a
  title or with servings < 1. Empty ingredient rows/sections and empty steps are
  dropped on save.
- **Save behaviour:** saving persists locally immediately and syncs to the cloud.
  On success the user is taken to the recipe (edit) or back to the library (new).
  Save errors are surfaced clearly — e.g. an expired session prompts re-sign-in,
  and an over-large recipe (usually a big photo) suggests using a smaller image.

### 4.4 Recipe detail
- Large **cover image** header (or utensils placeholder) with a dark gradient. The
  **title** overlays the bottom; the **source** shows beneath it and links out to
  the original page when a source URL exists.
- **Kebab (⋮) menu** over the image with: **Edit recipe**, **Share recipe**, **View
  original image** (only when an external original image exists), and **Delete
  recipe** (red; asks for confirmation, irreversible).
- **Meta row:** servings, prep time, total time (each shown only if set).
- **Plan this meal** button opens the date picker to add this recipe to the plan
  (see §4.6).
- **Tabs: Ingredients / Method.**
  - **Ingredients tab** has a **serving adjuster** (− / value / +, minimum 1). All
    ingredient quantities **scale live** with the chosen servings. Quantities
    render as friendly fractions where sensible (e.g. ½, ¾, ⅓). Ingredients are
    shown grouped by their section headings. Zero/blank quantities are hidden.
  - **Method tab** lists the numbered steps with amber step badges.
- A **Back to Library** button at the bottom.

### 4.5 Editing & deleting
- **Edit** reopens the recipe form pre-filled; saving returns to the detail view.
- **Delete** removes the recipe from the library everywhere (after confirmation).

### 4.6 Plan-a-date picker (shared component)
- A monthly **calendar** modal, Monday-first, with month navigation.
- Today is highlighted; dates that already have planned meals are subtly marked;
  the selected date is filled amber.
- Confirming adds the recipe to that date as a meal-plan entry (carrying the
  currently-chosen servings). From a recipe it then navigates to the Plan; from
  the library quick-plan it stays in place.
- The library **quick-plan** button pre-selects a sensible default date: the next
  empty day in the current or following week (falling back to today).

---

## 5. Meal Plan

The **Plan** tab helps the user decide what to eat each day. It has two views
toggled by a switch: **Plan** (a week view) and **History** (a month calendar).
A **Today** shortcut appears whenever the user has navigated away from the current
week/month, jumping them back.

### 5.1 Week view
- Shows the seven days of a week (Monday–Sunday) as stacked day cards. A label
  reads "This Week" / "Next Week" / "Last Week" or a date for other weeks.
- **Navigation:** left/right chevrons, and **horizontal swipe** gestures to move
  between weeks (with a slide animation). Vertical scrolling is not hijacked.
- Today's card is outlined in amber and its weekday label is amber.
- Each day card has a header (full weekday + date) and a **Plan** button
  (calendar-plus) to add a meal to that day.

#### 5.1.1 Meal entries on a day
Three kinds of entry can appear under a day, each shown as a "meal chip":
- **Recipe** — links to a saved recipe; shows the recipe's thumbnail and title.
- **Custom** — a free-text meal that isn't in the library; shows a document icon.
- **Dining out** — an eating-out entry with an optional location; shows a pin icon.

Entries within a day are ordered by **meal time**: breakfast, lunch, dinner,
snack, then untimed.

Each meal chip provides inline controls:
- **Tap the title:** opens the recipe (recipe entries) or opens the Add-Recipe
  form pre-filled with the title (custom entries) so a custom meal can be
  "digitised" into a real recipe.
- **Meal-time selector:** a small pill (Breakfast/Lunch/Dinner/Snack, or none),
  defaulting to Dinner in display.
- **Servings:** a people-count control that opens a small +/− stepper modal
  (minimum 1).
- **Add to shopping list** (recipe entries only): a cart button that adds that
  meal's scaled ingredients to the shopping list. Once added it shows a green
  check and reads "Added to shopping list". (See §6.)
- **Change day:** a calendar button to move the entry to a different date via a
  month picker.
- **Delete:** a trash button that asks for confirmation ("Remove meal?") before
  removing the entry.

### 5.2 Planning a meal (from a day)
- The day's **Plan** button opens the **Plan a Meal** modal with two tabs:
  - **From Library:** search the recipe library; tapping a recipe adds it to the
    day at that recipe's default servings. If the search matches nothing, an "Add
    as custom meal" option creates a custom entry from the typed text.
  - **Dining Out:** an optional restaurant/location field and a "Mark as Dining
    Out" button.

### 5.3 History view
- A **month calendar** (Monday-first) showing which meals were planned on each day.
- Each day cell shows up to two meal titles (as small amber tags) and a "+N" when
  there are more. Today is highlighted.
- **Navigation:** month chevrons and horizontal swipe between months.
- This view is read-only — it's a glanceable record of past and planned meals.

---

## 6. Shopping List

The **List** tab turns planned meals into a practical, categorised shopping list.
Items carry a name, a **category** (see below), a checked/in-basket state, an
order, and — for items derived from recipes — the **meal sources** that
contributed them.

**Categories** (fixed set, used for grouping and auto-sort in this order):
Vegetables, Fruit, Herbs & Spices, Bakery, Meat & Seafood, Dairy & Eggs, Pantry,
Frozen, Beverages, Other.

### 6.1 Two modes: Shop and Edit
A switch toggles between:
- **Shop mode** — optimised for shopping: large tappable rows, a **progress bar**
  and "checked/total" count at the top. Tapping a row checks it off (moves it to
  "In basket", struck through and dimmed). Items derived from recipes show a small
  utensils button that opens a **"Used in meals"** breakdown listing each
  contributing recipe and its scaled quantity.
- **Edit mode** — for curating the list: add items, rename items, recategorise
  items, reorder by drag handle, and remove items.

### 6.2 Generating from the plan
- When the list is empty, an empty state ("Your list is empty") offers **Generate
  from Plan** and a manual add field.
- **Generate Shopping List** modal:
  - Lists every **recipe** meal planned across the current and next week, each with
    its day and servings, pre-selected with a checkbox.
  - The user can deselect meals to exclude them.
  - It **consolidates** ingredients across the selected meals: identical
    ingredients (matched by normalised name + unit) are combined and their
    quantities summed, each scaled to the meal's planned servings.
  - Items the user keeps in their **Store Cupboard** (pantry) are **skipped**; the
    modal shows "N ingredients in store cupboard — will be skipped".
  - **Generate (N)** builds the list, grouped/sorted by category. Generating
    replaces the current list.

### 6.3 Adding meals incrementally
- From a day's meal chip, **Add to shopping list** merges just that meal's scaled
  ingredients into the existing list (deduping against items already present and
  tracking the meal as a source). Adding the same meal twice is prevented.

### 6.4 Consolidation & normalisation behaviour (observable rules)
The list is smart about combining "the same thing" written different ways:
- **Units** are normalised (grams→g, tablespoons→tbsp, cups, etc.), and vague
  units like "clove", "piece", "each", "whole" are treated as no unit.
- **Names** are normalised for matching: singular/plural is unified; prep
  descriptors are stripped ("finely chopped parsley" → "parsley", "garlic cloves"
  → "garlic", "lemon juice"/"juice of 1 lemon" → "lemon"); and common
  American/British synonyms are unified (cilantro→coriander, zucchini→courgette,
  eggplant→aubergine, scallion/green onion→spring onion, arugula→rocket).
- Each generated item's display text is "quantity unit name" (quantity as a
  friendly fraction), e.g. "1 ½ cup flour".
- Each item is auto-assigned a **category** by keyword matching (most specific
  match wins).

### 6.5 Editing the list (Edit mode)
- **Add item manually:** a text field (with Enter-to-add) creates a new item;
  its category is auto-detected from the name.
- **Rename:** tap an item to edit its text inline (Enter saves, Escape cancels).
- **Recategorise:** each item has a category dropdown. Changing a category is
  remembered as an override signal (used to improve categorisation over time).
- **Reorder:** drag items by a grip handle (supports touch drag on mobile), with a
  live preview of the drop position. Only unchecked items reorder.
- **Auto sort:** a one-tap "Auto sort" arranges unchecked items by category order.
- **Remove:** an ✕ removes an item.
- **Clear all** (in the "In basket" section) removes all checked items at once.

### 6.6 Checked items & undo
- Checked items collect in an **"In basket (N)"** section, dimmed and struck
  through, in both modes.
- An **Undo** button appears after list-changing actions (check/uncheck, remove,
  edits, sort, reorder) and reverts the last change.

### 6.7 Link to Store Cupboard
- A "View store cupboard" link on the list header navigates to the Pantry screen.

---

## 7. Recipe Sharing

Users can send copies of recipes to other people by **email address**. The
recipient sees them in their own library's "Shared with You" inbox the next time
they sign in.

### 7.1 Share a single recipe
- From a recipe's kebab menu → **Share recipe** opens a modal.
- The user enters the **recipient's email**. Validation requires a well-formed
  email and prevents sharing with **yourself**.
- On send, a success state confirms "Recipe sent to <email> — They'll see it in
  their library when they sign in."
- A full copy of the recipe (including images, ingredient sections, and steps) is
  sent; it does not link back to the sender's copy.

### 7.2 Bulk share
- From library selection mode (§4.1.2), **Share N** opens a bulk-share modal that
  sends every selected recipe to one email address, showing "Sending X of N…"
  progress and a success summary.

### 7.3 Receiving shares
- Incoming shares appear in the **"Shared with You"** inbox at the top of the
  library (§4.1.1), addressed to the user's email.
- **Save** copies the recipe into the user's own library (as their own,
  independent copy). **Dismiss** discards it. Save All / Dismiss All handle the
  whole inbox.
- The inbox is always fetched fresh (it reflects actions taken on other devices),
  so it isn't relied on offline.

---

## 8. Store Cupboard (Pantry)

The **Store Cupboard** is the user's list of staples they always have on hand, so
those ingredients are automatically **excluded** when generating a shopping list.

- Reached via the "View store cupboard" link on the Shopping List, with a back
  button to return.
- Explanatory text: "Ingredients you always have in stock. These are skipped when
  generating your shopping list."
- **Add** items via a text field (Enter to add); duplicates (by normalised name)
  are silently ignored. Each added item is auto-categorised.
- Items are shown as rows with a **category dropdown**, a **drag handle** to
  reorder (touch-friendly), and a remove button. An **Auto sort** button orders by
  category.
- Names display capitalised.
- **Empty state:** "Nothing here yet — Add oils, spices, and staples you always
  have in stock."

---

## 9. Offline support (PWA)

The app is installable and designed to keep working without a connection.

- **Installable PWA:** standalone display, app icons, theme colours, and offline
  caching of the app shell. Updates apply automatically in the background.
- **Works offline:** the recipe **library**, **meal plan**, **shopping list**, and
  **store cupboard** are all fully readable and editable offline. Changes are
  stored locally and sync when the connection returns (see §10 / §3.2).
- **What requires a connection:** AI recipe extraction (URL and Photo modes) and
  sending/receiving shares. These are clearly disabled or explained when offline;
  manual recipe entry remains available.
- Locally stored data (including recipe images) persists reliably across restarts
  so the library is available immediately on next launch, even before the network
  or sign-in has been re-validated.

---

## 10. Sync & multi-device behaviour

(Observable behaviour the rebuild must preserve.)

- All data syncs **live** across a user's signed-in devices; an edit on one device
  appears on another without a manual refresh.
- Edits are **merged by recency** rather than blindly overwritten, so working on
  two devices (including while one was offline) does not silently lose changes.
- The **shopping list** in particular is safe for concurrent editing: checking an
  item off on one device and renaming/reordering it on another both survive and
  merge, rather than clobbering each other. Deletions are respected across devices
  (a deleted item does not "resurrect" from a stale copy), while an edit made after
  a deletion can intentionally bring an item back.
- A brief transient "empty" read never wipes existing data (the app waits to
  confirm a genuine clear before emptying a collection).

---

## 11. Settings

Reached from the profile menu.

- **Gemini API Key:** recipe extraction from photos and URLs runs on the user's
  **own** Google Gemini API key, so usage is billed to them, not shared. The
  screen explains this, links to where to get a free key
  (aistudio.google.com/apikey), and notes free-tier rate limits.
- The user pastes a key (masked input) and **Save**s it. The saved key is
  **encrypted server-side and never shown back** — the UI only ever indicates "A
  key is saved for your account" (green check) once one exists.
- **Remove key** deletes the stored key.
- Save/remove show progress and success/error states. When a key is present the
  URL/Photo capture modes become available; without one they prompt the user here.

---

## 12. Cross-cutting UX details

- **Confirmation for destructive actions:** deleting a recipe and removing a
  planned meal both require explicit confirmation. Removing shopping/pantry items
  is instantly undoable (shopping) or immediate (pantry).
- **Friendly empty states** on every list (library, plan, shopping list, pantry,
  search results) with an icon, a headline, guidance, and often a primary action.
- **Loading & error feedback:** spinners and in-button working labels ("Saving…",
  "Extracting…", "Analysing photo…", "Sending X of N…") and concise, plain-English
  error messages tailored to the cause (network, quota, permission, copyright,
  size).
- **Fractions & units:** quantities display as human-friendly fractions and
  normalised units throughout.
- **Dates:** week views are Monday-first; dates display in a British/EN-GB style
  (e.g. "3rd Mar").
- **Touch-first interactions:** long-press to multi-select, swipe to change
  week/month, drag handles to reorder, large tap targets in Shop mode.
- **Images are optional everywhere:** every recipe/thumbnail gracefully falls back
  to a utensils placeholder when an image is missing or fails to load.

---

## 13. Screen & route inventory

| Area | Screen | Purpose |
|------|--------|---------|
| Auth | Splash | Branded loading gate |
| Auth | Sign in | Google sign-in |
| Recipes | Library | Grid of recipes, search, shares inbox, bulk select |
| Recipes | Recipe detail | View recipe, scale servings, plan, share, edit, delete |
| Recipes | Add / Edit recipe | URL / Photo / Manual capture and the recipe form |
| Plan | Week view | Plan meals per day for a week |
| Plan | History | Month calendar of planned meals |
| Shopping | List (Shop/Edit) | Categorised list, check off, curate |
| Shopping | Generate modal | Build list from planned meals |
| Pantry | Store Cupboard | Staples excluded from shopping generation |
| Settings | Settings | Manage the Gemini API key |

---

## 14. Recipe extraction — expected quality behaviour (user-visible)

Extraction should feel reliable and faithful to the source, degrading gracefully:

- **From a URL:** prefer the page's own structured recipe data when available
  (exact, instant); otherwise read the page text with AI. Pull in the page's lead
  image as the cover when present, and keep the source link.
- **From a photo:** read the image directly with AI when possible; if that's
  blocked or unclear, fall back to on-device text recognition (OCR) and structure
  that text. Always try to return *something* usable from a legible photo.
- **Faithfulness:** extracted steps and ingredient lines mirror the source's own
  structure and wording — steps aren't split finer or merged coarser than the
  original, and ingredient lines aren't rewritten.
- **Sections preserved:** grouped ingredients (e.g. "For the sauce") become named
  sections; a single unlabeled group stays as one section.
- **Graceful failure:** rate-limit, overload, copyright-block, and unreadable-photo
  cases each produce a specific, actionable message, and manual entry is always
  offered as the fallback.
</content>
</invoke>
