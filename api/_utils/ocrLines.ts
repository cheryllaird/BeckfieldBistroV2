// Line-level clean-up and classification of OCR text, used by parseRecipeText.
//
// OCR of a real cookbook photo is not tidy text: ingredient bullets come back as
// "#", "@" or "©", page furniture (nutrition boxes, page numbers, edge slivers of
// the facing page) comes back as junk lines, and units are misread ("thsp"). The
// helpers here turn raw lines into cleaned lines with a few flags the parser can
// reason about. They never invent text: every character of a cleaned line came
// from the OCR line, apart from the unit spellings fixed in fixUnitTypos.
//
// Every regex here runs on untrusted OCR text, so each is anchored or bounded and
// lines are capped in length before matching.

export interface OcrLine {
  text: string;
  /** The line started with a bullet glyph — a strong sign it is an ingredient. */
  bulleted: boolean;
}

const MAX_LINE = 500;

// Bullet glyphs as Tesseract reads them. "|" is left out on purpose: it is
// usually the edge of a column or photo, not a bullet, and is stripped as edge
// noise instead.
const BULLET_RE = /^[#@©®¢&•*+«»~■●◆▪]{1,3}\s*/;
const EDGE_NOISE_START_RE = /^[|!:;,.'"`_=-]{1,3}\s+/;
const EDGE_NOISE_END_RE = /\s+[|!:;'"`_=<>»«~^-]{1,3}$/;

/** Common Tesseract misreads of units, fixed only right after an amount. */
function fixUnitTypos(line: string): string {
  return line
    .replace(/^(\d+(?:[.,]\d+)?\s*)th[es]p\b/i, '$1tbsp')
    .replace(/^(\d+(?:[.,]\d+)?)(?=(?:tbsp|tsp|large|small|medium|heaped|level)\b)/i, '$1 ');
}

// A bullet glyph in the middle of a line: Tesseract has read two side-by-side
// ingredient columns as one line ("2 tbsp olive oil # 1x 400g tin beans").
// "&" is left out because it is ordinary text mid-line ("salt & pepper").
const MID_BULLET_RE = /\s[#@©®¢•■●]\s?(?=[\d¼½¾⅓⅔⅛\p{L}])/gu;

/** Splits a raw OCR line where a mid-line bullet starts a second item. */
export function splitAtBullets(raw: string): string[] {
  const line = raw.slice(0, MAX_LINE);
  const parts: string[] = [];
  let from = 0;
  for (const m of line.matchAll(MID_BULLET_RE)) {
    parts.push(line.slice(from, m.index));
    from = m.index + 1; // keep the bullet so the new part is flagged as bulleted
  }
  parts.push(line.slice(from));
  return parts;
}

export function cleanLine(raw: string): OcrLine {
  let text = raw.slice(0, MAX_LINE).replace(/\s+/g, ' ').trim();
  text = text.replace(EDGE_NOISE_START_RE, '');
  const bullet = text.match(BULLET_RE);
  const bulleted = bullet !== null && text.length > bullet[0].length;
  if (bullet) text = text.slice(bullet[0].length);
  text = text.replace(EDGE_NOISE_END_RE, '').trim();
  // A lone 1-2 digit number after a word is a step number from the column
  // beside an ingredient ("2 tbsp lemon juice 2"), not part of the ingredient.
  if (/^[\d¼½¾⅓⅔⅛]/.test(text) || bulleted) text = text.replace(/(?<=\p{L}[,.]?)\s+\d{1,2}$/u, '');
  return { text: fixUnitTypos(text), bulleted };
}

function letterCount(s: string): number {
  let n = 0;
  for (const ch of s) if (/\p{L}/u.test(ch)) n++;
  return n;
}

/** Tokens that read as words: letters only (plus ' and -), at least one vowel. */
export function realWords(s: string): string[] {
  return s
    .split(' ')
    .map((t) => t.replace(/^[("'‘“]+|[)"'’”,.;:!?]+$/g, ''))
    .filter((t) => t.length >= 2 && /^[\p{L}'’-]+$/u.test(t) && /[aeiouy]/i.test(t));
}

/**
 * Junk that no recipe field should hold: edge slivers, page numbers, symbol
 * soup. A line needs a real word of three letters or more, and letters must
 * make up at least half of its non-space characters.
 */
export function isNoiseLine(text: string): boolean {
  const nonSpace = text.replace(/\s/g, '').length;
  if (nonSpace === 0) return true;
  if (!realWords(text).some((w) => w.length >= 3)) return true;
  if (letterCount(text) / nonSpace < 0.5) return true;
  // Mostly fragments around one stray word ("Ray - ==", "h h 4 Fla"). An
  // amount-led line is exempt: "1 x 400g tin" is mostly short tokens too.
  return !/^[\d¼½¾⅓⅔⅛]/.test(text) && wordLikeRatio(text) < 0.4;
}

/** Share of tokens that read as words — low for OCR garbage that has some letters. */
export function wordLikeRatio(text: string): number {
  const tokens = text.split(' ').filter(Boolean);
  return tokens.length === 0 ? 0 : realWords(text).length / tokens.length;
}

// Nutrition boxes and magazine page furniture. Each pattern needs a nutrition
// word next to an amount, so "100g fat-free yogurt" stays an ingredient.
const NUTRITION_RES = [
  /\b\d+(?:[.,]\d+)?\s*k?cals?\b/i,
  /\b\d+(?:[.,]\d+)?\s*g\s+(?:protein|fat|carbs?|carbohydrates?|fibre|fiber|sugars?|salt|saturates)(?![\w-])/i,
  /\btotal sugars\b/i,
  /^per (?:serving|portion|tablespoon|slice|person|piece)\b/i,
  /^(?:hands-on|active|total|cooking|prep(?:aration)?)\s+time\b/i,
];

export function isNutritionLine(text: string): boolean {
  return NUTRITION_RES.some((re) => re.test(text));
}

// A magazine-style numbered step: "2 Add the red pepper and cook…". The word
// after the number is capitalised (so "2 tbsp oil" is not a step), and either
// it is a cooking instruction verb or the line is long. "2 Indian bay leaves"
// is short and opens with no verb, so it stays an ingredient.
const MAGAZINE_STEP_RE = /^\d{1,2}\s+([A-Z][a-z]+)\b/;
const STEP_VERBS = new Set([
  'add', 'arrange', 'bake', 'beat', 'blend', 'blitz', 'boil', 'bring', 'brush', 'combine', 'cook', 'cover',
  'cut', 'divide', 'drain', 'drizzle', 'fold', 'fry', 'grate', 'grill', 'heat', 'knead', 'leave', 'line',
  'lower', 'make', 'meanwhile', 'melt', 'mix', 'pat', 'place', 'pour', 'preheat', 'put', 'reduce', 'remove',
  'return', 'rinse', 'roast', 'scatter', 'season', 'serve', 'set', 'simmer', 'slice', 'spoon', 'spread',
  'sprinkle', 'stir', 'taste', 'thread', 'tip', 'toss', 'transfer', 'whisk',
]);
export function isMagazineStep(text: string): boolean {
  const m = text.match(MAGAZINE_STEP_RE);
  if (!m) return false;
  return text.length >= 35 || STEP_VERBS.has(m[1].toLowerCase());
}

/**
 * Whether a line continues the ingredient above it rather than starting a new
 * one: it opens in lower case or with "(", e.g. "cut into cubes" or "(stalks and
 * leaves)". In an unbulleted list a lower-case line can be an ingredient of its
 * own ("salt and pepper"), so there it only joins when the line above clearly
 * runs on (ends with a comma, an open bracket or a linking word).
 */
const RUNS_ON_RE = /(?:[,(-]|\b(?:and|or|into|in|of|the|a|cut|plus|finely|roughly|thinly|very|about))$/i;
export function continuesIngredient(prev: OcrLine, line: OcrLine, bulletedList: boolean): boolean {
  if (line.bulleted || line.text.length > 45) return false;
  if (line.text.startsWith('(')) return true;
  if (!/^\p{Ll}/u.test(line.text)) return false;
  return bulletedList || RUNS_ON_RE.test(prev.text);
}
