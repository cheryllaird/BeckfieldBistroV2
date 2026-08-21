/**
 * Offline unit checks for the deterministic recipe parsers.
 * Run with:  npx tsx test-parsers.ts
 *
 * No network, no API key, no fixtures — pure functions in api/_utils/recipeParsers.ts.
 * The bulk of these guard ingredient-section splitting, which is the parser's
 * most failure-prone judgement call: it has to tell a group heading ("For the
 * dressing") apart from an unquantified ingredient ("Thai chillies, to taste"),
 * and getting it wrong shatters a flat ingredient list into bogus sections.
 */

import { looksLikeSectionHeader, buildIngredientSections } from './api/_utils/recipeParsers.js';

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failures.push(`${name}\n    expected: ${e}\n    actual:   ${a}`);
  }
}

// ─── looksLikeSectionHeader ──────────────────────────────────────────────────
// Real headings must be recognised…
for (const line of [
  'For the dressing',
  'For the curry /',
  'For the sauce:',
  'FOR THE DRESSING',
  'To serve',
  'To make the paste',
  'Dressing',
  'GARNISH',
  'Salad:',
]) {
  check(`header: "${line}"`, looksLikeSectionHeader(line), true);
}

// …and ingredients must not be, especially unquantified ones. Every line below
// parses to quantity 0 with no unit, which an earlier heuristic read as a heading.
for (const line of [
  'Thai chillies, to taste',
  'Salt',
  'Fish sauce',
  'Fresh cilantro for garnish',
  'Salt and pepper to taste',
  'Juice of 1 lime',
  'A handful of roasted peanuts',
  'Dressing of your choice',
  'Sugar, to taste',
  '2 cloves garlic',
  '1/2 cup roasted peanuts',
  '½ tsp sugar',
  // Informal amounts, the other family of quantity-less ingredients. These
  // measure by comparison ("thumb-sized") or by container ("small bunch of"),
  // so no leading number and no unit at the start of the line. Note that "piece"
  // and "bunch" ARE unit words, but unitRe is anchored — it never reaches them.
  'thumb-sized piece of ginger, shredded',
  'thumb-sized piece of ginger, finely grated',
  'a thumb-sized piece of ginger',
  'small bunch of coriander, chopped',
  'handful of roasted cashews',
  'pinch of sugar',
  // A trailing "to serve"/"for frying" is an ingredient's note, not a heading —
  // only the same words at the START of a line title a group.
  'sesame oil, to serve',
  'vegetable oil, for frying',
]) {
  check(`ingredient: "${line}"`, looksLikeSectionHeader(line), false);
}

// ─── buildIngredientSections ─────────────────────────────────────────────────
// The reported bug: a flat list containing an unquantified ingredient must stay
// ONE unlabelled section, not split at that ingredient.
const flatList = [
  '1 lb green papaya, shredded',
  '2 cloves garlic',
  'Thai chillies, to taste',
  '2 Tbsp fish sauce',
  '2 Tbsp lime juice',
  'Roasted peanuts for garnish',
];
const flat = buildIngredientSections(flatList);
check('flat list → 1 section', flat.length, 1);
check('flat list → untitled', flat[0].title, '');
check('flat list → keeps every ingredient', flat[0].ingredients.length, flatList.length);
check(
  'flat list → unquantified ingredient survives as an ingredient',
  flat[0].ingredients.map((i) => i.originalText).includes('Thai chillies, to taste'),
  true,
);

// Genuine headings still split the list.
const grouped = buildIngredientSections([
  'For the salad',
  '1 lb green papaya, shredded',
  'Thai chillies, to taste',
  'For the dressing:',
  '2 Tbsp fish sauce',
  'Palm sugar, to taste',
]);
check('grouped → 2 sections', grouped.length, 2);
check('grouped → titles', grouped.map((s) => s.title), ['For the salad', 'For the dressing']);
check('grouped → counts', grouped.map((s) => s.ingredients.length), [2, 2]);

// An empty list still yields one empty section (callers index [0]).
check('empty list → 1 empty section', buildIngredientSections([]), [{ title: '', ingredients: [] }]);

// ─── Report ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failures.length} failed\n`);
for (const f of failures) console.error(`  FAIL  ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
