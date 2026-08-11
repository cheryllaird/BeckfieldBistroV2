import type { Ingredient, IngredientSection, MealSource, PantryItem, Recipe, ShoppingItem, ShoppingCategory } from '../types';

// American English → canonical English synonyms applied at word level
const WORD_SYNONYMS: Array<[RegExp, string]> = [
  [/\bcilantro\b/g, 'coriander'],
  [/\bzucchini\b/g, 'courgette'],
  [/\beggplant\b/g, 'aubergine'],
  [/\bscallion\b/g, 'spring onion'],
  [/\bgreen onion\b/g, 'spring onion'],
  [/\barugula\b/g, 'rocket'],
];

function singularWord(word: string): string {
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
  // Only the hissing and -o stems take a full "es" plural ("tomatoes", "dishes",
  // "boxes"). Everything else just gained an "s", so stripping "es" would eat a
  // letter of the word itself — that's what turned "oranges" into "orang".
  if (/(?:s|x|z|ch|sh|o)es$/.test(word) && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('is') && word.length > 3) return word.slice(0, -1);
  return word;
}

// Adverbs that can lead a prep clause ("finely chopped", "freshly grated").
const PREP_CLAUSE_ADVERBS =
  'very|finely|coarsely|roughly|thinly|thickly|freshly|lightly|well|neatly|evenly|preferably|ideally|optionally';

// Meats sold as mince. For these, "minced" names the product on the shelf and
// stays in the name; minced anything else (garlic, ginger, chilli) is a knife
// instruction. This is the closed set — what can be minced as prep is not.
const MINCE_PRODUCT_MEATS = new Set([
  'beef', 'bison', 'buffalo', 'chicken', 'duck', 'goat', 'lamb', 'meat', 'mutton',
  'ostrich', 'pork', 'quorn', 'rabbit', 'soya', 'steak', 'turkey', 'veal', 'venison',
]);

/** Whether a name refers to something sold as mince ("beef", "chicken thigh"). */
function isMinceProduct(name: string): boolean {
  return name
    .toLowerCase()
    .split(/[\s-]+/)
    .some((word) => MINCE_PRODUCT_MEATS.has(singularWord(word.replace(/[^a-z]/g, ''))));
}

// Verbs that mark the text after a comma as an instruction rather than part of
// the ingredient's name. "minced" and "ground" are deliberately absent — they
// get their own rules below, since they often name the product instead.
const PREP_CLAUSE_VERBS =
  'beaten|blanched|boiled|broken|bruised|chilled|chopped|cleaned|cooked|cored|crumbled|crushed|' +
  'cubed|defrosted|de-?seeded|deveined|diced|divided|drained|dried|flaked|grated|halved|' +
  'julienned|mashed|melted|peeled|pitted|pounded|pureed|quartered|reserved|rinsed|roasted|' +
  'scrubbed|seeded|separated|shaved|shelled|shredded|sifted|skinned|sliced|smashed|soaked|softened|' +
  'squeezed|stemmed|stoned|strained|thawed|toasted|torn|trimmed|warmed|washed|whipped|whisked|zested';

// Parts of an ingredient that a recipe may call for by name ("zest of a lemon",
// "coriander leaves"). Naming a part doesn't change what goes in the basket.
const INGREDIENT_PART_WORDS =
  'zest|zested|juice|juiced|rind|peel|skin|pith|flesh|seeds?|stalks?|stems?|' +
  'leaves|leaf|sprigs?|cloves?|wedges?|florets?|tops?|fronds?';

const PREP_CLAUSE_PATTERNS: RegExp[] = [
  // "chopped", "finely diced", "peeled and grated"
  new RegExp(`^(?:(?:${PREP_CLAUSE_ADVERBS})\\s+)*(?:${PREP_CLAUSE_VERBS})\\b`),
  // "freshly ground" — modified, so it's a prep step; a bare "ground" names the
  // product ("almonds, ground")
  new RegExp(`^(?:${PREP_CLAUSE_ADVERBS})\\s+ground\\b`),
  // "minced" is prep unless the ingredient is one that's sold as mince, which
  // isPrepClause checks before reaching here
  /^(?:[a-z]+ly\s+)?minced\b/,
  // "cut into florets", "torn in half"
  /^(?:cut|sliced|chopped|broken|torn|snapped)\s+(?:in|into)\b/,
  // "plus extra for dusting"
  /^(?:plus|and)\s+(?:extra|more|a little)\b/,
  // "to taste", "to serve", "or to garnish"
  /^(?:or\s+)?to\s+(?:taste|serve|garnish|finish|decorate|drizzle)\b/,
  // "for frying", "for the garnish"
  /^for\s+(?:the\s+)?(?:garnish|serving|topping|dusting|frying|drizzling|greasing|brushing|dredging|coating|sprinkling)\b/,
  /^(?:at\s+)?room\s+temperature$/,
  /^optional$/,
  /^if\s+(?:needed|desired|using|preferred|liked|available)$/,
  // "seeds removed", "stalks discarded", "juice reserved"
  /\b(?:removed|discarded|reserved|left\s+whole|to\s+taste)$/,
  // Clauses that name which part of the ingredient is used ("orange, zest and
  // juice", "basil, leaves"). The part is a note about the same shopping item,
  // so it drops out and the whole ingredient stays.
  new RegExp(`^(?:the\\s+)?(?:${INGREDIENT_PART_WORDS})(?:\\s*(?:,|and|&|\\+|/|or)\\s*(?:${INGREDIENT_PART_WORDS}))*(?:\\s+only)?$`),
];

/**
 * Whether a comma-separated clause is a preparation or serving instruction
 * ("cut into florets", "to taste") rather than part of the ingredient's name
 * ("self-raising" in "flour, self-raising"). Needs the name the clause hangs
 * off, because "minced" reads as prep for garlic but names the product for beef.
 */
function isPrepClause(clause: string, head: string): boolean {
  if (/\bminced\b/.test(clause) && isMinceProduct(head)) return false;
  return PREP_CLAUSE_PATTERNS.some((pattern) => pattern.test(clause));
}

/**
 * Drops prep instructions written after a comma while keeping clauses that name
 * the ingredient, so "broccoli, cut into florets" becomes "broccoli" but
 * "chicken thighs, bone-in" survives intact.
 */
function stripPrepClauses(name: string): string {
  const [head, ...rest] = splitClauses(name);
  const kept = rest.filter((clause) => clause && !isPrepClause(clause, head));
  return [head, ...kept].filter(Boolean).join(', ');
}

/** Splits on commas that separate clauses, ignoring commas inside brackets. */
function splitClauses(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current.trim());
  return parts;
}

// A bracketed size hint ("(400g tin)", "(about 4)") measures the same shopping
// item rather than naming a different one.
const AMOUNT_NOTE = new RegExp(
  `^(?:about|approx\\.?|around|roughly)?\\s*[\\d./¼½¾⅓⅔⅛\\s-]*\\s*(?:${[
    'g', 'kg', 'mg', 'ml', 'l', 'oz', 'lb', 'lbs', 'tsp', 'tbsp', 'cup', 'cups',
    'grams?', 'kilograms?', 'ounces?', 'pounds?', 'millilitres?', 'milliliters?',
    'litres?', 'liters?', 'teaspoons?', 'tablespoons?', 'cans?', 'tins?', 'jars?',
    'packs?', 'packets?', 'bunch(?:es)?', 'bags?', 'slices?', 'pieces?',
  ].join('|')})\\b|^(?:about|approx\\.?|around|roughly)?\\s*[\\d./¼½¾⅓⅔⅛\\s-]+$`
);

// Bracketed grades that describe which one to pick rather than what to buy.
const GRADE_NOTE =
  /^(?:extra\s+)?(?:large|small|medium|big|jumbo|ripe|unwaxed|organic|free[- ]range|any\s+colour|any\s+color)$/;

/**
 * Drops bracketed notes that describe the same ingredient — how it's prepared
 * ("(finely chopped)"), which part is used ("(zest and juice)"), what size to
 * buy ("(400g tin)") — while keeping brackets that name a different thing.
 */
function stripNoteParentheses(name: string): string {
  return name
    .replace(/\(([^()]*)\)/g, (_, note: string, offset: number) => {
      const head = name.slice(0, offset).trim();
      // A note can hold several clauses ("(large, beaten)"); each stands or falls
      // on its own, and the brackets go only once nothing is left inside.
      const kept = note
        .split(',')
        .map((clause) => clause.trim())
        .filter(
          (clause) =>
            clause &&
            !isPrepClause(clause, head) &&
            !AMOUNT_NOTE.test(clause) &&
            !GRADE_NOTE.test(clause)
        );
      return kept.length > 0 ? `(${kept.join(', ')})` : '';
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Measures too loose to add up ("a handful", "a pinch"). They lead an
// ingredient's text as often as a real unit does.
const VAGUE_MEASURE_WORDS =
  'handful|pinch|dash|splash|knob|drizzle|glug|sprig|bunch|squeeze|few|grating';

const LEADING_VAGUE_MEASURE = new RegExp(
  `^(?:a|an|\\d+(?:[./]\\d+)?)?\\s*(${VAGUE_MEASURE_WORDS})s?\\s+of\\s+`
);

/**
 * The loose measure an ingredient's name leads with, for lines that carry the
 * amount in the name instead of the unit field ("a handful of coriander").
 */
function leadingVagueUnit(name: string): string {
  return name.toLowerCase().trim().match(LEADING_VAGUE_MEASURE)?.[1] ?? '';
}

/** The unit an ingredient is measured in, falling back to one named in its text. */
function ingredientUnit(ingredient: Pick<Ingredient, 'name' | 'unit'>): string {
  return ingredient.unit.trim() || leadingVagueUnit(ingredient.name);
}

const UNIT_NORMALIZE_MAP: Record<string, string> = {
  gram: 'g', grams: 'g',
  kilogram: 'kg', kilograms: 'kg',
  ounce: 'oz', ounces: 'oz',
  pound: 'lb', pounds: 'lb', lbs: 'lb',
  milliliter: 'ml', millilitre: 'ml', milliliters: 'ml', millilitres: 'ml',
  liter: 'l', litre: 'l', liters: 'l', litres: 'l',
  teaspoon: 'tsp', teaspoons: 'tsp',
  tablespoon: 'tbsp', tablespoons: 'tbsp',
  cups: 'cup',
  piece: '', pieces: '', each: '', whole: '',
  clove: '', cloves: '',
};

export function normalizeUnit(unit: string): string {
  const lower = unit.toLowerCase().trim();
  if (Object.prototype.hasOwnProperty.call(UNIT_NORMALIZE_MAP, lower)) {
    return UNIT_NORMALIZE_MAP[lower];
  }
  // Units the map doesn't list are still plural half the time ("handfuls",
  // "cans"); singularising keeps them from splitting into two entries.
  return singularWord(lower);
}

// Units that convert within a family, sized in the family's base unit (g for
// mass, ml for volume). Anything outside this table only adds up against
// itself — two "cans" combine, a can and 400 g do not.
const CONVERTIBLE_UNITS: Record<string, { family: string; inBase: number }> = {
  mg: { family: 'mass', inBase: 0.001 },
  g: { family: 'mass', inBase: 1 },
  kg: { family: 'mass', inBase: 1000 },
  oz: { family: 'mass', inBase: 28.35 },
  lb: { family: 'mass', inBase: 453.59 },
  ml: { family: 'volume', inBase: 1 },
  l: { family: 'volume', inBase: 1000 },
  tsp: { family: 'volume', inBase: 5 },
  tbsp: { family: 'volume', inBase: 15 },
  cup: { family: 'volume', inBase: 240 },
};

const VAGUE_UNITS = new Set(VAGUE_MEASURE_WORDS.split('|'));

/**
 * How prominently an amount should read on the shopping list. Whole items come
 * first — they're what you pick off the shelf — then measured amounts, with
 * loose ones like "a handful" last.
 */
function unitRank(unit: string): number {
  if (!unit) return 0;
  if (CONVERTIBLE_UNITS[unit]) return 1;
  if (VAGUE_UNITS.has(unit)) return 3;
  return 2;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

// Symbols that read the same at any amount — "2 g", never "2 gs".
const UNIT_ABBREVIATIONS = new Set(['g', 'kg', 'mg', 'ml', 'l', 'oz', 'lb', 'tsp', 'tbsp']);

/** Puts a unit back in the plural when the amount calls for it ("2 handfuls"). */
function displayUnit(unit: string, quantity: number): string {
  if (!unit || quantity <= 1 || unit.endsWith('s') || UNIT_ABBREVIATIONS.has(unit)) return unit;
  return /(?:s|x|z|ch|sh|o)$/.test(unit) ? `${unit}es` : `${unit}s`;
}

/** A quantity and unit as written on one recipe line ("2 tbsp", "1 handful"). */
export interface IngredientAmount {
  quantity: number;
  unit: string;
}

/**
 * Totals amounts of a single ingredient, one string per unit family. Amounts
 * that convert are summed into the finest unit present ("1 kg" + "500 g" →
 * "1500 g"); ones that don't stay side by side, ordered by unitRank.
 */
function summariseAmounts(amounts: readonly IngredientAmount[]): string[] {
  const groups = new Map<string, { rank: number; order: number; byUnit: Map<string, number> }>();

  for (const { quantity, unit } of amounts) {
    const normUnit = normalizeUnit(unit);
    const key = CONVERTIBLE_UNITS[normUnit]?.family ?? normUnit;
    let group = groups.get(key);
    if (!group) {
      group = { rank: unitRank(normUnit), order: groups.size, byUnit: new Map() };
      groups.set(key, group);
    }
    group.byUnit.set(normUnit, round2((group.byUnit.get(normUnit) ?? 0) + quantity));
  }

  return Array.from(groups.values())
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map(({ byUnit }) => {
      const entries = Array.from(byUnit.entries());
      if (entries.length > 1) {
        // Same family, different units: total in the smallest one so the sum stays exact.
        const [finestUnit] = entries.reduce((finest, entry) =>
          CONVERTIBLE_UNITS[entry[0]].inBase < CONVERTIBLE_UNITS[finest[0]].inBase ? entry : finest
        );
        const base = entries.reduce((sum, [u, q]) => sum + q * CONVERTIBLE_UNITS[u].inBase, 0);
        const total = round2(base / CONVERTIBLE_UNITS[finestUnit].inBase);
        return `${formatQuantity(total)} ${displayUnit(finestUnit, total)}`;
      }
      const [unit, quantity] = entries[0];
      // "salt, to taste" arrives as a bare name with no quantity — leave it bare.
      if (quantity <= 0) return '';
      return [formatQuantity(quantity), displayUnit(unit, quantity)].filter(Boolean).join(' ');
    })
    .filter(Boolean);
}

/**
 * The shopping list label for an ingredient and everything the plan needs of
 * it. Amounts that can't be added together trail the name in brackets, so a
 * lemon wanted whole by one recipe and juiced by another reads
 * "1 lemon (+ 2 tbsp)" instead of splitting into two things to buy.
 */
export function formatItemName(amounts: readonly IngredientAmount[], name: string): string {
  const [lead, ...extra] = summariseAmounts(amounts);
  const head = [lead ?? '', name].filter(Boolean).join(' ');
  return extra.length > 0 ? `${head} (+ ${extra.join(', ')})` : head;
}

/** Returns the canonical display name for an ingredient (normalises synonyms, strips redundant modifiers). */
export function canonicalizeIngredientName(name: string): string {
  let s = name.toLowerCase().trim();

  // Drop bracketed notes about the same ingredient (e.g. "orange (zest and juice)" → "orange")
  s = stripNoteParentheses(s);

  // Strip prep instructions after a comma (e.g. "broccoli, cut into florets" → "broccoli"),
  // keeping clauses that are part of the name (e.g. "flour, self-raising")
  s = stripPrepClauses(s);

  // Rewrite "[zest/juice] of [N] ingredient" → "[ingredient]" so it consolidates with the whole fruit/veg
  s = s.replace(
    new RegExp(
      `^(?:the\\s+)?(?:(?:finely|coarsely|freshly)\\s+)?(?:grated\\s+)?(?:zest|juice|rind|peel)` +
        `(?:\\s*(?:,|and|&|\\+|/|or)\\s*(?:zest|juice|rind|peel))*\\s+of\\s+(?:\\d+(?:[./]\\d+)?\\s+)?(.+)$`
    ),
    (_, ingredient: string) => {
      const words = ingredient.trim().split(/\s+/);
      words[words.length - 1] = singularWord(words[words.length - 1]);
      return words.join(' ');
    }
  );

  // Strip a loose leading measure ("a handful of coriander" → "coriander"); the
  // amount belongs on the ingredient's quantity/unit, not in its name.
  s = s.replace(LEADING_VAGUE_MEASURE, '');
  s = s.replace(/^of\s+/, '');

  // Strip leading prep-method descriptors (e.g. "diced onion" → "onion", "finely chopped parsley" → "parsley")
  s = s.replace(
    /^(?:(?:very|finely|coarsely|roughly|thinly|freshly|lightly|well)\s+)?(?:diced|chopped|cubed|julienned|blanched|trimmed|quartered|halved|pitted|seeded|de-?seeded|peeled|cored|crumbled|torn|squeezed)\s+/,
    ''
  );

  // "minced" is prep for everything except the meats sold as mince, and "ground"
  // names the product ("ground almonds") unless a modifier marks it as a step
  s = s.replace(
    /^(?:(very|finely|coarsely|roughly|freshly|lightly|well)\s+)?(minced|ground)\s+(.+)$/,
    (whole, modifier: string | undefined, word: string, rest: string) => {
      if (word === 'minced') return isMinceProduct(rest) ? whole : rest;
      return modifier ? rest : whole;
    }
  );

  // Strip leading quality/preparation modifiers
  s = s.replace(/^extra[- ]virgin\s+/, '');
  s = s.replace(/^flat[- ]leaf(?:ed)?\s+/, '');
  // "fresh coriander" is the same bunch as "coriander"; "dried" is deliberately
  // absent, since dried herbs are a different product on a different shelf.
  s = s.replace(/^(?:fresh|freshly)\s+(?=\S)/, '');
  // Sizes describe the pick, not the product ("2 large oranges" → oranges)
  s = s.replace(/^(?:large|small|medium|big|ripe|unwaxed)\s+(?=\S)/, '');

  // Strip the part-of-the-fruit suffix from citrus, so "lemon juice" / "orange
  // zest" consolidate with the whole fruit they're squeezed or grated from.
  // Only lemons and limes lose " juice" — orange and grapefruit juice are things
  // you buy by the carton.
  s = s.replace(/^(lemon|lime)s?\s+juice$/, '$1');
  s = s.replace(/^(lemon|lime|orange|grapefruit|clementine|satsuma|mandarin)s?\s+(?:zest|rind|peel)$/, '$1');

  // Strip trailing preparation/portioning descriptors. The leading capture stops
  // these from reaching across a comma and leaving a dangling one behind.
  s = s.replace(/([^,\s])\s+leaves?$/, '$1');
  s = s.replace(/([^,\s])\s+stalks?$/, '$1');
  s = s.replace(/([^,\s])\s+sprigs?$/, '$1');
  s = s.replace(/([^,\s])\s+cloves?$/, '$1');   // "garlic cloves" → "garlic"
  s = s.replace(/([^,\s])\s+wedges?$/, '$1');   // "lemon wedges" → "lemon"

  // Apply regional/American-English synonyms
  for (const [pattern, replacement] of WORD_SYNONYMS) {
    s = s.replace(pattern, replacement);
  }

  return s.trim();
}

export function normalizeIngredientName(name: string): string {
  const s = canonicalizeIngredientName(name);
  // Singularise the head noun for deduplication key generation
  const cut = Math.max(s.lastIndexOf(' '), s.lastIndexOf('-')) + 1;
  return s.slice(0, cut) + singularWord(s.slice(cut));
}

// Words that describe a *variant* of a staple rather than a different
// ingredient — "sea salt" is still salt, "freshly ground black pepper" is still
// pepper. Stripped from either end of a name before matching against the store
// cupboard, so a cupboard staple suppresses its variants.
const PANTRY_QUALIFIER_PREFIXES = new Set([
  'best', 'caster', 'coarse', 'coarsely', 'cold', 'cracked', 'dried', 'dry',
  'extra', 'fine', 'finely', 'flaked', 'flaky', 'free', 'fresh', 'freshly',
  'full', 'golden', 'good', 'granulated', 'ground', 'kosher', 'large', 'light',
  'low', 'medium', 'natural', 'organic', 'plain', 'pressed', 'pure', 'quality',
  'range', 'raw', 'reduced', 'ripe', 'rock', 'salted', 'sea', 'semi', 'skimmed',
  'small', 'table', 'toasted', 'unsalted', 'unsweetened', 'unwaxed', 'virgin',
  'whole',
]);

// "flak" is what the singulariser makes of "flakes".
const PANTRY_QUALIFIER_SUFFIXES = new Set(['crystal', 'flak', 'flake', 'granule', 'grain']);

// Staples whose name doubles as the head noun of unrelated ingredients
// ("pepper" → bell pepper, "butter" → peanut butter). These only ever match by
// full name, never as the head noun of a longer ingredient.
const AMBIGUOUS_PANTRY_HEADS = new Set([
  'bean', 'butter', 'corn', 'cream', 'milk', 'onion', 'pea', 'pepper', 'squash',
  'sugar',
]);

const AMOUNT_UNIT_WORDS = [
  'g', 'kg', 'mg', 'ml', 'l', 'oz', 'lb', 'lbs', 'tsp', 'tbsp', 'cup', 'cups',
  'gram', 'grams', 'kilogram', 'kilograms', 'ounce', 'ounces', 'pound', 'pounds',
  'milliliter', 'millilitre', 'milliliters', 'millilitres', 'liter', 'litre',
  'liters', 'litres', 'teaspoon', 'teaspoons', 'tablespoon', 'tablespoons',
  'pinch', 'dash', 'handful', 'clove', 'cloves', 'can', 'cans', 'tin', 'tins',
  'jar', 'jars', 'pack', 'packs', 'packet', 'packets', 'bunch', 'bag', 'bags',
];

const LEADING_AMOUNT = new RegExp(
  `^\\s*(?:[\\d./¼½¾⅓⅔⅛\\s-]+)?\\s*(?:(?:${AMOUNT_UNIT_WORDS.join('|')})\\.?\\s+)?`,
  'i'
);

/** Drops any leading quantity and unit from free text ("2 tsp sea salt" → "sea salt"). */
export function stripLeadingAmount(text: string): string {
  const stripped = text.replace(LEADING_AMOUNT, '').trim();
  return stripped || text.trim();
}

/** Strips variant qualifiers so "sea salt flakes" and "salt" compare equal. */
function pantryCoreName(normalizedName: string): string {
  let words = normalizedName.replace(/-/g, ' ').split(/\s+/).filter(Boolean);
  while (words.length > 1 && PANTRY_QUALIFIER_PREFIXES.has(words[0])) {
    words = words.slice(1);
  }
  while (words.length > 1 && PANTRY_QUALIFIER_SUFFIXES.has(words[words.length - 1])) {
    words = words.slice(0, -1);
  }
  return words.join(' ');
}

/**
 * Whether an ingredient is covered by a store cupboard staple. Matches the
 * staple itself, its variants ("salt" covers "sea salt"), and ingredients whose
 * head noun is the staple ("olive oil" covers "light olive oil") — except for
 * heads generic enough to catch unrelated ingredients.
 */
export function matchesPantryName(ingredientName: string, pantryNormalizedName: string): boolean {
  const ingredient = normalizeIngredientName(stripLeadingAmount(ingredientName));
  const pantry = normalizeIngredientName(pantryNormalizedName);
  if (!ingredient || !pantry) return false;
  if (ingredient === pantry) return true;

  const ingredientCore = pantryCoreName(ingredient);
  const pantryCore = pantryCoreName(pantry);
  if (ingredientCore === pantryCore) return true;
  if (AMBIGUOUS_PANTRY_HEADS.has(pantryCore)) return false;

  // Head-noun match, in either direction: "sunflower oil" vs cupboard "oil",
  // or "salt" vs cupboard "sea salt".
  return (
    ingredientCore.endsWith(` ${pantryCore}`) || pantryCore.endsWith(` ${ingredientCore}`)
  );
}

/** Returns the store cupboard staple covering this ingredient, if any. */
export function findPantryMatch(
  ingredientName: string,
  pantryItems: readonly PantryItem[]
): PantryItem | undefined {
  return pantryItems.find((p) => matchesPantryName(ingredientName, p.normalizedName));
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Returns a flat ingredient list from a recipe, preferring ingredientSections when present. */
export function getRecipeIngredients(recipe: Pick<Recipe, 'ingredients' | 'ingredientSections'>): Ingredient[] {
  if (recipe.ingredientSections?.length) {
    return recipe.ingredientSections.flatMap((s: IngredientSection) => s.ingredients);
  }
  return recipe.ingredients;
}

export function scaleIngredient(ingredient: Ingredient, originalServings: number, newServings: number): Ingredient {
  const ratio = newServings / originalServings;
  return { ...ingredient, quantity: Math.round(ingredient.quantity * ratio * 100) / 100 };
}

export function formatQuantity(quantity: number): string {
  if (quantity === Math.floor(quantity)) return String(quantity);
  // Convert to fractions for common values
  const fractions: Record<number, string> = {
    0.25: '¼', 0.5: '½', 0.75: '¾',
    0.33: '⅓', 0.67: '⅔',
    0.125: '⅛',
  };
  const rounded = Math.round(quantity * 1000) / 1000;
  const whole = Math.floor(rounded);
  const frac = Math.round((rounded - whole) * 1000) / 1000;
  const fracStr = fractions[frac];
  if (fracStr) return whole > 0 ? `${whole} ${fracStr}` : fracStr;
  return String(rounded);
}

// Order matters: first match wins, so more specific categories come first.
const CATEGORY_KEYWORDS: Record<ShoppingCategory, string[]> = {
  Frozen: ['edamame', 'frozen', 'ice cream', 'sorbet'],
  'Meat & Seafood': [
    'anchovy', 'bacon', 'beef', 'brisket', 'chicken', 'chorizo', 'clam', 'cod', 'crab',
    'duck', 'fish', 'guanciale', 'haddock', 'halibut', 'ham', 'herring', 'lamb', 'lobster',
    'mackerel', 'mince', 'mussel', 'octopus', 'oyster', 'pancetta', 'pepperoni', 'pork',
    'prawn', 'rib', 'salmon', 'sardine', 'sausage', 'scallop', 'seafood', 'shrimp', 'squid',
    'steak', 'tilapia', 'trout', 'tuna', 'turkey', 'veal', 'venison',
  ],
  'Dairy & Eggs': [
    'brie', 'butter', 'buttermilk', 'camembert', 'cheddar', 'cheese', 'colby',
    'cottage cheese', 'cream', 'crème fraîche', 'egg', 'emmental', 'feta', 'ghee',
    'gouda', 'gruyere', 'half-and-half', 'halloumi', 'jack cheese', 'kefir', 'lard',
    'mascarpone', 'milk', 'monterey', 'mozzarella', 'paneer', 'parmesan', 'pecorino',
    'provolone', 'quark', 'ricotta', 'stilton', 'yoghurt', 'yogurt',
  ],
  Bakery: [
    'bagel', 'baguette', 'biscuit', 'bread', 'brioche', 'bun', 'ciabatta', 'crumpet',
    'flatbread', 'focaccia', 'muffin', 'naan', 'pita', 'pitta', 'pretzel', 'roll',
    'scone', 'sourdough', 'tortilla', 'waffle', 'wrap',
  ],
  Fruit: [
    'apple', 'apricot', 'banana', 'berry', 'blueberr', 'cantaloupe', 'cherry', 'coconut',
    'currant', 'fig', 'grape', 'grapefruit', 'kiwi', 'lemon', 'lime', 'mango', 'melon',
    'nectarine', 'orange', 'peach', 'pear', 'pineapple', 'plum', 'pomegranate', 'raspberry',
    'strawberry', 'tangerine', 'watermelon',
  ],
  Beverages: [
    'beer', 'cider', 'coffee', 'espresso', 'gin', 'juice', 'kombucha', 'lemonade',
    'prosecco', 'rum', 'seltzer', 'smoothie', 'soda', 'sparkling water', 'spirits',
    'sports drink', 'tea', 'tonic water', 'vodka', 'water', 'whiskey', 'wine',
  ],
  Vegetables: [
    'artichoke', 'arugula', 'asparagus', 'aubergine', 'avocado', 'bean sprout', 'beetroot',
    'cherry tomato',
    'bell pepper', 'bok choy', 'broccoli', 'brussels sprout', 'cabbage', 'capsicum', 'carrot',
    'cauliflower', 'celery', 'courgette', 'cucumber', 'eggplant', 'endive', 'fennel',
    'green bean', 'green onion', 'jalapeño', 'kale', 'leek', 'lettuce', 'mushroom', 'okra',
    'onion', 'parsnip', 'pea', 'pepper', 'potato', 'pumpkin', 'radish', 'rhubarb', 'scallion',
    'shallot', 'spinach', 'spring onion', 'squash', 'sweet potato', 'sweetcorn', 'swiss chard',
    'tomato', 'turnip', 'yam', 'zucchini',
  ],
  'Herbs & Spices': [
    'allspice', 'anise', 'basil', 'bay leaf', 'black pepper', 'caraway', 'cardamom', 'cayenne',
    'chili powder', 'chilli', 'chive', 'cilantro', 'cinnamon', 'clove', 'coriander', 'cumin',
    'curry', 'dill', 'fennel seed', 'fenugreek', 'garlic', 'ginger', 'lemongrass', 'mace',
    'marjoram', 'mint', 'mustard seed', 'nutmeg', 'onion powder', 'oregano', 'paprika', 'parsley',
    'peppercorn', 'rosemary', 'saffron', 'sage', 'spice', 'star anise', 'sumac', 'tarragon',
    'thyme', 'turmeric',
  ],
  Pantry: [
    'almond', 'arrowroot', 'baking', 'bean', 'black bean', 'breadcrumb', 'broth', 'brown rice',
    'brown sugar', 'capers', 'cashew', 'chickpea', 'chocolate', 'cocoa', 'coconut milk',
    'cornmeal', 'cornstarch', 'cracker', 'dried', 'egg noodle', 'fish sauce', 'flour',
    'garbanzo', 'granola', 'hazelnut', 'honey', 'hot sauce', 'jam', 'jelly', 'ketchup',
    'kidney bean', 'lentil', 'maple syrup', 'marmalade', 'mayonnaise', 'molasses', 'mustard',
    'noodle', 'nut', 'oat', 'oil', 'olive', 'oyster sauce', 'pasta', 'peanut', 'peanut butter',
    'penne', 'pickle', 'pine nut', 'pistachio', 'preserve', 'rice', 'risotto', 'salt', 'sauce',
    'sesame', 'soy sauce', 'spaghetti', 'stock', 'sugar', 'sunflower seed', 'syrup', 'tahini',
    'tapioca', 'teriyaki', 'tomato paste', 'vanilla', 'vinegar', 'walnut', 'worcestershire',
  ],
  Other: [],
};

export function categorize(name: string): ShoppingCategory {
  const lower = name.toLowerCase();
  let bestMatch: { cat: ShoppingCategory; wordCount: number; charCount: number } | null = null;
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as [ShoppingCategory, string[]][]) {
    if (cat === 'Other') continue;
    for (const kw of keywords) {
      if (!lower.includes(kw)) continue;
      const wordCount = kw.split(' ').length;
      const charCount = kw.length;
      if (
        !bestMatch ||
        wordCount > bestMatch.wordCount ||
        (wordCount === bestMatch.wordCount && charCount > bestMatch.charCount)
      ) {
        bestMatch = { cat: cat as ShoppingCategory, wordCount, charCount };
      }
    }
  }
  return bestMatch?.cat ?? 'Other';
}

export function consolidateIngredients(
  ingredientGroups: {
    ingredients: Ingredient[];
    servings: number;
    originalServings: number;
    mealEntryId?: string;
    recipeTitle?: string;
  }[]
): ShoppingItem[] {
  // Keyed on the ingredient alone, not the unit, so the same thing measured two
  // ways ("1 lemon", "2 tbsp lemon juice") lands on one line of the list.
  const map = new Map<string, {
    amounts: IngredientAmount[];
    name: string;
    category: ShoppingCategory;
    sources: MealSource[];
  }>();

  for (const { ingredients, servings, originalServings, mealEntryId, recipeTitle } of ingredientGroups) {
    for (const ing of ingredients) {
      const scaled = scaleIngredient(ing, originalServings, servings);
      const key = normalizeIngredientName(scaled.name);
      const unit = ingredientUnit(scaled);
      const newSource: MealSource | undefined =
        mealEntryId && recipeTitle
          ? { mealEntryId, recipeTitle, scaledQuantity: scaled.quantity, unit, ingredientName: scaled.name }
          : undefined;
      const existing = map.get(key);
      if (existing) {
        existing.amounts.push({ quantity: scaled.quantity, unit });
        if (newSource) existing.sources.push(newSource);
      } else {
        map.set(key, {
          amounts: [{ quantity: scaled.quantity, unit }],
          name: canonicalizeIngredientName(scaled.name),
          category: categorize(scaled.name),
          sources: newSource ? [newSource] : [],
        });
      }
    }
  }

  return Array.from(map.entries())
    .map(([key, { amounts, name, category, sources }]) => ({
      id: generateId(),
      name: formatItemName(amounts, name),
      category,
      checked: false,
      mealSources: sources.length > 0 ? sources : undefined,
      ingredientKey: key,
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

export function mergeIntoShoppingList(
  existing: ShoppingItem[],
  ingredients: Ingredient[],
  scale: number,
  mealEntryId?: string,
  recipeTitle?: string,
  pantryItems: readonly PantryItem[] = [],
): ShoppingItem[] {
  const result = [...existing];

  for (const ing of ingredients) {
    // Never add what the user already keeps in their store cupboard.
    if (findPantryMatch(ing.name, pantryItems)) continue;

    const scaledQty = round2(ing.quantity * scale);
    const normUnit = normalizeUnit(ingredientUnit(ing));
    const key = normalizeIngredientName(ing.name);
    const canonicalName = canonicalizeIngredientName(ing.name);

    // Lists generated before consolidation went unit-agnostic carry keys of the
    // form "name__unit"; those items are still the same ingredient.
    const existingIndex = result.findIndex(
      (item) => item.ingredientKey === key || item.ingredientKey?.startsWith(`${key}__`)
    );

    if (existingIndex >= 0) {
      const existingItem = result[existingIndex];
      // Skip if this meal entry is already tracked as a source
      if (mealEntryId && existingItem.mealSources?.some((s) => s.mealEntryId === mealEntryId)) {
        continue;
      }
      const newSource: MealSource = {
        mealEntryId: mealEntryId ?? '',
        recipeTitle: recipeTitle ?? '',
        scaledQuantity: scaledQty,
        unit: normUnit,
        ingredientName: ing.name,
      };
      const newSources = [...(existingItem.mealSources ?? []), newSource];
      result[existingIndex] = {
        ...existingItem,
        name: formatItemName(
          newSources.map((s) => ({ quantity: s.scaledQuantity, unit: s.unit })),
          canonicalName
        ),
        mealSources: newSources,
        ingredientKey: key,
      };
    } else {
      // Fall back to text match for manually-added items without an ingredientKey
      const text = formatItemName([{ quantity: scaledQty, unit: normUnit }], canonicalName);
      if (result.some((item) => item.name.toLowerCase() === text.toLowerCase() && !item.ingredientKey)) {
        continue;
      }
      const newSource: MealSource | undefined = mealEntryId
        ? { mealEntryId, recipeTitle: recipeTitle ?? '', scaledQuantity: scaledQty, unit: normUnit, ingredientName: ing.name }
        : undefined;
      result.push({
        id: generateId(),
        name: text,
        category: categorize(ing.name),
        checked: false,
        mealSources: newSource ? [newSource] : undefined,
        ingredientKey: key,
      });
    }
  }

  return result;
}

export function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getWeekDays(weekOffset: number = 0): Date[] {
  const today = new Date();
  const monday = new Date(today);
  // Get this Monday
  const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1;
  monday.setDate(today.getDate() - dayOfWeek + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export function formatDayLabel(date: Date): { weekday: string; monthDay: string; isToday: boolean } {
  const today = new Date();
  const isToday = isoDate(date) === isoDate(today);
  return {
    weekday: date.toLocaleDateString('en-GB', { weekday: 'short' }),
    monthDay: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    isToday,
  };
}

/**
 * What to show as a recipe's source. Recipes saved without one fall back to
 * "Unknown", which reads poorly when there's a link to name it by instead —
 * so prefer the link's host in that case.
 */
export function recipeSourceLabel(recipe: Pick<Recipe, 'source' | 'sourceUrl'>): string {
  const source = recipe.source?.trim();
  if (source && source.toLowerCase() !== 'unknown') return source;
  if (recipe.sourceUrl) {
    try {
      return new URL(recipe.sourceUrl).hostname.replace(/^www\./, '');
    } catch {
      // fall through to the plain source
    }
  }
  return source || 'Unknown';
}
