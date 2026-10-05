import { AMOUNT_UNIT_WORDS, LEADING_AMOUNT, LEADING_VAGUE_MEASURE } from './amounts';
import { toUkNames } from './ukNames';
import { foldDiacritics, lastWord, singularWord } from './words';

// Turning a recipe's ingredient text into the thing you'd pick off a UK
// supermarket shelf. A recipe line names one product but wraps it in notes —
// how to prepare it, which part is used, what size to pick, what to swap it
// for — and every one of those notes would otherwise split one item across
// several lines of the shopping list.
//
//   canonicalizeIngredientName  →  the display name ("spring onions")
//   normalizeIngredientName     →  the dedup key    ("spring onion")

// Adverbs that can lead a prep instruction ("finely chopped", "freshly grated").
const PREP_ADVERBS =
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
    .split(/[\s-]+/)
    .some((word) => MINCE_PRODUCT_MEATS.has(singularWord(word.replace(/[^a-z]/g, ''))));
}

// Verbs that mark a note as an instruction rather than part of the ingredient's
// name. "minced" and "ground" are deliberately absent — they get their own
// rules, since they often name the product instead.
const PREP_VERBS =
  'bashed|beaten|blanched|boiled|broken|bruised|butterflied|chilled|chopped|cleaned|cooked|cored|' +
  'crumbled|crushed|cubed|cut|defrosted|de-?seeded|deveined|diced|divided|drained|dried|flaked|' +
  'grated|halved|hulled|juiced|julienned|mashed|melted|packed|patted|peeled|picked|pitted|pounded|' +
  'pureed|quartered|reserved|rinsed|roasted|scrubbed|seeded|segmented|separated|shaved|shelled|' +
  'shredded|shucked|sifted|skinned|sliced|smashed|snipped|soaked|softened|spatchcocked|' +
  'spiralised|spiralized|squeezed|stemmed|stoned|strained|thawed|toasted|torn|trimmed|warmed|' +
  'washed|whipped|whisked|zested';

// Shapes a recipe asks for things to be cut into ("thin strips", "2cm chunks").
const CUT_SHAPES =
  'strips?|slices?|rings?|chunks?|cubes?|dice|matchsticks?|batons?|wedges?|pieces?|' +
  'half[- ]moons?|ribbons?|shreds?|rounds?|discs?|segments?|quarters?|halves|lengths?';

const CUT_SIZES =
  'very|thin|thick|fine|small|large|medium|big|even|chunky|bite[- ]sized?|' +
  '\\d+(?:\\.\\d+)?\\s*(?:cm|mm|in|inch|inches)';

// Parts of an ingredient that a recipe may call for by name ("zest of a lemon",
// "coriander leaves"). Naming a part doesn't change what goes in the basket.
const INGREDIENT_PARTS =
  'zest|zested|juice|juiced|rind|peel|skin|pith|flesh|seeds?|stalks?|stems?|' +
  'leaves|leaf|sprigs?|cloves?|wedges?|florets?|tops?|fronds?';

const PREP_NOTE_PATTERNS: RegExp[] = [
  // "chopped", "finely diced", "peeled and grated"
  new RegExp(`^(?:(?:${PREP_ADVERBS})\\s+)*(?:${PREP_VERBS})\\b`),
  // "seeds removed", "leaves picked", "roughly chopped" at the end of a clause.
  // Needs a space before the verb so "sun-dried" still names the product.
  new RegExp(`\\s(?:${PREP_VERBS}|removed|discarded|left\\s+whole|to\\s+taste)$`),
  // "thin strips", "in rings", "into 2cm chunks"
  new RegExp(`^(?:(?:in|into)\\s+)?(?:(?:a|an|\\d+)\\s+)?(?:(?:${CUT_SIZES})\\s+)*(?:${CUT_SHAPES})\\b`),
  // "freshly ground" — modified, so it's a prep step; a bare "ground" names the
  // product ("almonds, ground")
  new RegExp(`^(?:${PREP_ADVERBS})\\s+ground\\b`),
  // "minced" is prep unless the ingredient is one that's sold as mince, which
  // isNoteClause checks before reaching here
  /^(?:[a-z]+ly\s+)?minced\b/,
  // "plus extra for dusting"
  /^(?:plus|and)\s+(?:extra|more|a little)\b/,
  // "to taste", "to serve", "or to garnish"
  /^(?:or\s+)?to\s+(?:taste|serve|garnish|finish|decorate|drizzle)\b/,
  // "for frying", "for the sauce", "if using", "see tip", "such as Maldon"
  /^(?:for|if|see|note|such\s+as|e\.?g\.?)\b/,
  /^(?:at\s+)?room\s+temperature$/,
  /^optional$/,
  // Clauses that name which part of the ingredient is used ("orange, zest and
  // juice", "basil, leaves"). The part is a note about the same shopping item,
  // so it drops out and the whole ingredient stays.
  new RegExp(`^(?:the\\s+)?(?:${INGREDIENT_PARTS})(?:\\s*(?:,|and|&|\\+|/|or)\\s*(?:${INGREDIENT_PARTS}))*(?:\\s+only)?$`),
];

// A size hint ("400g tin", "about 4") measures the same shopping item rather
// than naming a different one.
const AMOUNT_NOTE = new RegExp(
  `^(?:about|approx\\.?|around|roughly)?\\s*[\\d./¼½¾⅓⅔⅛\\s-]*\\s*(?:${AMOUNT_UNIT_WORDS.join('|')})\\b` +
    `|^(?:about|approx\\.?|around|roughly)?\\s*[\\d./¼½¾⅓⅔⅛\\s-]+$`
);

// Grades that describe which one to pick rather than what to buy.
const GRADE_NOTE =
  /^(?:extra\s+)?(?:large|small|medium|big|jumbo|ripe|unwaxed|organic|free[- ]range|cold|homemade|shop[- ]bought|store[- ]bought|any\s+colou?r)$/;

// An alternative the cook may swap in ("or red onion"). The list buys the first.
const ALTERNATIVE_NOTE = /^or\b/;

/** Whether one name's words end the other's ("coriander" and "fresh coriander"). */
function namesSameThing(a: string, b: string): boolean {
  const words = (s: string) => s.split(/\s+/).filter(Boolean).map(singularWord);
  const [short, long] = [words(a), words(b)].sort((x, y) => x.length - y.length);
  return short.length > 0 && short.every((word, i) => word === long[long.length - short.length + i]);
}

/**
 * Whether a clause written after a comma or in brackets is a note about the
 * ingredient — prep ("cut into florets"), an amount ("400g tin"), a grade
 * ("large"), a swap ("or red onion") or the same name again ("cilantro" once
 * made UK) — rather than part of its name ("self-raising" in "flour,
 * self-raising"). Needs the name the clause hangs off, because "minced" reads
 * as prep for garlic but names the product for beef.
 */
function isNoteClause(clause: string, head: string): boolean {
  if (/\bminced\b/.test(clause) && isMinceProduct(head)) return false;
  return (
    PREP_NOTE_PATTERNS.some((pattern) => pattern.test(clause)) ||
    AMOUNT_NOTE.test(clause) ||
    GRADE_NOTE.test(clause) ||
    ALTERNATIVE_NOTE.test(clause) ||
    namesSameThing(clause, head)
  );
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

/**
 * Drops bracketed notes about the same ingredient ("(finely chopped)",
 * "(zest and juice)", "(400g tin)", "(or vegetable stock)") while keeping
 * brackets that say something about what to buy.
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
        .filter((clause) => clause && !isNoteClause(clause, head));
      return kept.length > 0 ? `(${kept.join(', ')})` : '';
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// A short describing clause that can move in front of the name it qualifies:
// "flour, self-raising" is "self-raising flour". Prepositional clauses ("in
// brine", "skin on") and anything longer stay where they are.
const FOLDABLE_CLAUSE =
  /^(?!(?:in|with|without|from|on|off|at|and|plus)\b)(?!.*\s(?:on|off|in|out)$)[a-z][a-z'-]*(?:\s[a-z][a-z'-]*)?$/;

/**
 * Drops note clauses written after a comma and folds short describing ones in
 * front of the name, so "broccoli, cut into florets" becomes "broccoli",
 * "shallots, or red onion" becomes "shallots", and "almonds, ground" lands on
 * the same line as "ground almonds".
 */
function resolveClauses(name: string): string {
  const [head, ...rest] = splitClauses(name);
  const kept = rest.filter((clause) => clause && !isNoteClause(clause, head));
  const folded = kept.filter((clause) => FOLDABLE_CLAUSE.test(clause));
  const trailing = kept.filter((clause) => !FOLDABLE_CLAUSE.test(clause));
  return [[...folded, head].join(' '), ...trailing].filter(Boolean).join(', ');
}

// "[zest/juice] of [N] ingredient" → "ingredient", so it consolidates with the
// whole fruit.
const PART_OF_PATTERN = new RegExp(
  `^(?:the\\s+)?(?:(?:finely|coarsely|freshly)\\s+)?(?:grated\\s+)?(?:zest|juice|rind|peel)` +
    `(?:\\s*(?:,|and|&|\\+|/|or)\\s*(?:zest|juice|rind|peel))*\\s+of\\s+(?:(?:a|an|half(?:\\s+an?)?|\\d+(?:[./]\\d+)?)\\s+)?(.+)$`
);

// Prep a recipe writes in front of the name ("diced onion"). Deliberately
// narrower than PREP_VERBS: "dried", "roasted", "toasted", "crushed" and
// "flaked" lead the names of products in their own right ("dried apricots",
// "crushed tomatoes", "flaked almonds").
const LEADING_PREP = new RegExp(
  // Bare "chopped tomatoes" is the tin, not a prep note.
  `^(?!chopped tomato)(?:(?:${PREP_ADVERBS})\\s+)*(?:beaten|blanched|chopped|cored|crumbled|cubed|de-?seeded|deveined|` +
    `diced|drained|grated|halved|julienned|melted|peeled|pitted|quartered|rinsed|seeded|sifted|` +
    `sliced|softened|squeezed|thawed|torn|trimmed)\\s+`
);

/**
 * "minced" is prep for everything except the meats sold as mince, which
 * become "beef mince" whether written "minced beef" or "ground beef". Any
 * other "ground" names the product ("ground almonds") unless a modifier marks
 * it as a step ("freshly ground black pepper").
 */
function resolveMinceAndGround(s: string): string {
  return s.replace(
    new RegExp(`^(?:((?:${PREP_ADVERBS}))\\s+)?(minced|ground)\\s+(.+)$`),
    (whole, modifier: string | undefined, word: string, rest: string) => {
      if (isMinceProduct(rest)) return `${rest} mince`;
      if (word === 'minced') return rest;
      return modifier ? rest : whole;
    }
  );
}

// Descriptors that lead a name without changing what's bought. Applied until
// none match, since they stack in any order ("fresh chopped coriander",
// "chopped fresh coriander").
const LEADING_DESCRIPTORS: Array<(s: string) => string> = [
  // An amount written into the name ("2 shallots", "400g chopped tomatoes")
  // belongs in the quantity; consolidation reads it from there.
  (s) => s.replace(LEADING_AMOUNT, ''),
  (s) => s.replace(LEADING_VAGUE_MEASURE, ''),
  // "thumb-sized piece of ginger", "2cm chunk of ginger"
  (s) => s.replace(/^(?:[a-z0-9-]+\s+)?(?:piece|chunk)s?\s+of\s+/, ''),
  (s) => s.replace(/^(?:of|a|an)\s+/, ''),
  (s) => s.replace(LEADING_PREP, ''),
  resolveMinceAndGround,
  (s) => s.replace(/^extra[- ]virgin\s+/, ''),
  (s) => s.replace(/^flat[- ]leaf(?:ed)?\s+/, ''),
  // "fresh coriander" is the same bunch as "coriander"; "dried" is deliberately
  // absent, since dried herbs are a different product on a different shelf.
  (s) => s.replace(/^(?:fresh|freshly)\s+(?=\S)/, ''),
  // Sizes describe the pick, not the product ("large oranges" → oranges)
  (s) => s.replace(/^(?:large|small|medium|big|ripe|unwaxed)\s+(?=\S)/, ''),
];

function stripLeadingDescriptors(name: string): string {
  let s = name;
  for (let pass = 0; pass < 10; pass += 1) {
    const next = LEADING_DESCRIPTORS.reduce((acc, strip) => strip(acc), s).trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

/**
 * Drops the part of the plant or fruit a recipe names, so "lemon juice",
 * "coriander leaves" and "garlic cloves" consolidate with the whole thing.
 * Only lemons and limes lose " juice" — orange and grapefruit juice are things
 * you buy by the carton.
 */
function stripTrailingParts(name: string): string {
  return name
    .replace(/^(lemon|lime)s?\s+juice$/, '$1')
    .replace(/^(lemon|lime|orange|grapefruit|clementine|satsuma|mandarin)s?\s+(?:zest|rind|peel)$/, '$1')
    // The leading capture stops these reaching across a comma and leaving a
    // dangling one behind.
    .replace(/([^,\s])\s+(?:stalks?|sprigs?|cloves?|wedges?)$/, '$1')
    // Bay, lime and curry leaves are the product, not a part of one.
    .replace(/([^,\s])(?<!\b(?:bay|curry|lime|kaffir|banana|vine|fig))\s+(?:leaves|leaf)$/, '$1');
}

/** The UK shopping list name for a recipe's ingredient text ("Fresh cilantro, chopped" → "coriander"). */
export function canonicalizeIngredientName(name: string): string {
  let s = name.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
  s = toUkNames(s);
  s = stripNoteParentheses(s);
  s = resolveClauses(s);
  s = s.replace(PART_OF_PATTERN, (_, ingredient: string) => {
    const words = ingredient.trim().split(/\s+/);
    words[words.length - 1] = singularWord(words[words.length - 1]);
    return words.join(' ');
  });
  s = stripLeadingDescriptors(s);
  s = stripTrailingParts(s);
  return s.trim();
}

/**
 * The key two ingredient lines share when they're the same thing to buy:
 * the canonical name, accent-free, with its head noun singular.
 */
export function normalizeIngredientName(name: string): string {
  const s = foldDiacritics(canonicalizeIngredientName(name));
  const comma = s.indexOf(',');
  const head = comma >= 0 ? s.slice(0, comma) : s;
  const tail = comma >= 0 ? s.slice(comma) : '';
  const last = lastWord(head);
  return head.slice(0, head.length - last.length) + singularWord(last) + tail;
}
