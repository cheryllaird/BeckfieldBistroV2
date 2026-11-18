// Pure scoring for the OCR-only extraction eval (`npm run eval:ocr`).
// No I/O, no OCR: everything here takes a truth recipe and either a parsed
// recipe or a block of OCR text, and returns numbers. See
// docs/recipe-extraction.md §11 for what each metric means.

export interface ScoredIngredient {
  name?: string;
  quantity: number;
  unit: string;
  originalText: string;
}

export interface RecipeLike {
  title: string;
  servings: number;
  ingredientSections?: { title: string; ingredients: ScoredIngredient[] }[];
  ingredients?: ScoredIngredient[];
  steps: string[];
}

/**
 * One stage's score for one photo. Counts rather than ratios, so a corpus can
 * be aggregated by summing (micro-average). `null` means "not measured at this
 * stage": text stages have no predicted ingredients, servings or step count.
 */
export interface StageScore {
  ingredientsTruth: number;
  ingredientsMatched: number;
  /** Ingredients the parser produced. Null for text stages. */
  ingredientsPredicted: number | null;
  /** Matched ingredients whose quantity and unit are both exactly right. Null for text stages. */
  quantityUnitExact: number | null;
  stepTruthChars: number;
  stepEdits: number;
  stepCountMatch: boolean | null;
  title: boolean;
  servings: boolean | null;
  /** Field-level edits the user would make to reach the truth. Null for text stages. */
  edits: number | null;
}

/** Ingredient text similarity needed to count as the same ingredient. */
const INGREDIENT_MATCH = 0.8;
/** Title similarity needed to count as right. */
const TITLE_MATCH = 0.8;
/** Step similarity needed to pair a parsed step with a truth step (edits estimate only). */
const STEP_MATCH = 0.6;

const UNIT_SYNONYMS: Record<string, string> = {
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbs: 'tbsp', tbsps: 'tbsp',
  teaspoon: 'tsp', teaspoons: 'tsp', tsps: 'tsp',
  cups: 'cup', ounce: 'oz', ounces: 'oz', pound: 'lb', pounds: 'lb', lbs: 'lb',
  gram: 'g', grams: 'g', kilogram: 'kg', kilograms: 'kg',
  milliliter: 'ml', millilitre: 'ml', milliliters: 'ml', millilitres: 'ml',
  liter: 'l', litre: 'l', liters: 'l', litres: 'l',
  cloves: 'clove', slices: 'slice', pieces: 'piece', cans: 'can', tins: 'tin',
  packages: 'package', pkg: 'package', sprigs: 'sprig', stalks: 'stalk', heads: 'head',
};

export function normalizeUnit(unit: string): string {
  const u = unit.trim().toLowerCase().replace(/\.$/, '');
  return UNIT_SYNONYMS[u] ?? u;
}

/** Case, typography and whitespace never count as errors. */
function normalizeText(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Step numbering ("1.", "2)") is presentation, not content. */
function normalizeStep(s: string): string {
  return normalizeText(s).replace(/^\d+[.)]\s*/, '');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** 1 for identical normalized text, 0 for nothing in common. */
export function similarity(a: string, b: string): number {
  const x = normalizeText(a);
  const y = normalizeText(b);
  const longest = Math.max(x.length, y.length);
  return longest === 0 ? 1 : 1 - levenshtein(x, y) / longest;
}

/**
 * Fewest edits that turn some substring of `haystack` into `needle`
 * (semi-global alignment: skipping text before and after is free). Used to ask
 * "is this truth text present, in reading order, anywhere in the OCR text?".
 */
export function substringDistance(needle: string, haystack: string): number {
  if (!needle.length) return 0;
  // Row per needle char; column 0 costs i, every haystack start is free.
  let prev = new Array<number>(haystack.length + 1).fill(0);
  let curr = new Array<number>(haystack.length + 1);
  for (let i = 1; i <= needle.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= haystack.length; j++) {
      const cost = needle[i - 1] === haystack[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return Math.min(...prev);
}

/**
 * One-to-one fuzzy pairing: the most similar pair is taken first, then the
 * next most similar among what is left. Returns [truthIndex, predIndex] pairs.
 */
export function matchItems(truth: string[], predicted: string[], threshold: number): [number, number][] {
  const candidates: { t: number; p: number; s: number }[] = [];
  truth.forEach((t, ti) =>
    predicted.forEach((p, pi) => {
      const s = similarity(t, p);
      if (s >= threshold) candidates.push({ t: ti, p: pi, s });
    }),
  );
  candidates.sort((a, b) => b.s - a.s || a.t - b.t || a.p - b.p);
  const usedT = new Set<number>();
  const usedP = new Set<number>();
  const pairs: [number, number][] = [];
  for (const c of candidates) {
    if (usedT.has(c.t) || usedP.has(c.p)) continue;
    usedT.add(c.t);
    usedP.add(c.p);
    pairs.push([c.t, c.p]);
  }
  return pairs.sort((a, b) => a[0] - b[0]);
}

export function flattenIngredients(recipe: RecipeLike): ScoredIngredient[] {
  const fromSections = (recipe.ingredientSections ?? []).flatMap((s) => s.ingredients);
  return fromSections.length > 0 ? fromSections : (recipe.ingredients ?? []);
}

function quantityUnitEqual(a: ScoredIngredient, b: ScoredIngredient): boolean {
  return Math.abs((a.quantity || 0) - (b.quantity || 0)) < 0.01 && normalizeUnit(a.unit) === normalizeUnit(b.unit);
}

/** Character error rate. Null when the truth has no steps (nothing to measure). */
export function cer(score: Pick<StageScore, 'stepEdits' | 'stepTruthChars'>): number | null {
  return score.stepTruthChars === 0 ? null : score.stepEdits / score.stepTruthChars;
}

/** Scores a structured recipe (the parser's output) against the truth. */
export function scoreParsed(truth: RecipeLike, predicted: RecipeLike): StageScore {
  const truthIngs = flattenIngredients(truth);
  const predIngs = flattenIngredients(predicted);
  const ingPairs = matchItems(
    truthIngs.map((i) => i.originalText),
    predIngs.map((i) => i.originalText),
    INGREDIENT_MATCH,
  );
  let quantityUnitExact = 0;
  let imperfectIngredients = 0;
  for (const [t, p] of ingPairs) {
    const qu = quantityUnitEqual(truthIngs[t], predIngs[p]);
    if (qu) quantityUnitExact++;
    if (!qu || normalizeText(truthIngs[t].originalText) !== normalizeText(predIngs[p].originalText)) {
      imperfectIngredients++;
    }
  }

  const truthSteps = truth.steps.map(normalizeStep).filter(Boolean);
  const predSteps = predicted.steps.map(normalizeStep).filter(Boolean);
  const truthJoined = truthSteps.join('\n');
  const stepEdits = levenshtein(truthJoined, predSteps.join('\n'));
  const stepPairs = matchItems(truthSteps, predSteps, STEP_MATCH);
  const imperfectSteps = stepPairs.filter(([t, p]) => truthSteps[t] !== predSteps[p]).length;

  const title = similarity(truth.title, predicted.title) >= TITLE_MATCH;
  const servings = (truth.servings || 0) === (predicted.servings || 0);
  const edits =
    (normalizeText(truth.title) === normalizeText(predicted.title) ? 0 : 1) +
    (servings ? 0 : 1) +
    (truthIngs.length - ingPairs.length) +
    (predIngs.length - ingPairs.length) +
    imperfectIngredients +
    (truthSteps.length - stepPairs.length) +
    (predSteps.length - stepPairs.length) +
    imperfectSteps;

  return {
    ingredientsTruth: truthIngs.length,
    ingredientsMatched: ingPairs.length,
    ingredientsPredicted: predIngs.length,
    quantityUnitExact,
    stepTruthChars: truthJoined.length,
    stepEdits,
    stepCountMatch: truthSteps.length === predSteps.length,
    title,
    servings,
    edits,
  };
}

/**
 * Scores plain OCR text (before any parsing): how much of the truth is present
 * in reading order, so a perfect parser could have found it. Ingredient lines,
 * steps and the title are each located by best substring alignment.
 */
export function scoreText(truth: RecipeLike, text: string): StageScore {
  const haystack = normalizeText(text);
  const present = (needle: string, threshold: number): boolean => {
    const n = normalizeText(needle);
    return n.length > 0 && substringDistance(n, haystack) / n.length <= 1 - threshold;
  };

  const truthIngs = flattenIngredients(truth);
  const matched = truthIngs.filter((i) => present(i.originalText, INGREDIENT_MATCH)).length;

  const truthSteps = truth.steps.map(normalizeStep).filter(Boolean);
  const stepEdits = truthSteps.reduce((sum, s) => sum + substringDistance(s, haystack), 0);
  // Each step is aligned on its own, so separators between steps are not counted
  const stepTruthChars = truthSteps.reduce((sum, s) => sum + s.length, 0);

  return {
    ingredientsTruth: truthIngs.length,
    ingredientsMatched: matched,
    ingredientsPredicted: null,
    quantityUnitExact: null,
    stepTruthChars,
    stepEdits,
    stepCountMatch: null,
    title: present(truth.title, TITLE_MATCH),
    servings: null,
    edits: null,
  };
}

/** Corpus-level metrics: all ratios 0-1, null when nothing was measurable. */
export interface Metrics {
  photos: number;
  quantityUnitExact: number | null;
  ingredientRecall: number | null;
  ingredientPrecision: number | null;
  stepCer: number | null;
  stepCountMatch: number | null;
  title: number | null;
  servings: number | null;
  withinTwoEdits: number | null;
  gatePass: number | null;
}

export interface ScoredPhoto {
  score: StageScore;
  gatePassed: boolean;
}

const ratio = (num: number, den: number): number | null => (den === 0 ? null : num / den);

function rate(values: (boolean | null)[]): number | null {
  const known = values.filter((v): v is boolean => v !== null);
  return ratio(known.filter(Boolean).length, known.length);
}

/** Micro-averages counts (recall, precision, CER) and rates the per-photo booleans. */
export function aggregate(photos: ScoredPhoto[]): Metrics {
  const s = photos.map((p) => p.score);
  const sum = (pick: (x: StageScore) => number | null) => s.reduce((acc, x) => acc + (pick(x) ?? 0), 0);
  const parsed = s.filter((x) => x.ingredientsPredicted !== null);
  return {
    photos: photos.length,
    quantityUnitExact: parsed.length ? ratio(sum((x) => x.quantityUnitExact), parsed.reduce((a, x) => a + x.ingredientsMatched, 0)) : null,
    ingredientRecall: ratio(sum((x) => x.ingredientsMatched), sum((x) => x.ingredientsTruth)),
    ingredientPrecision: parsed.length ? ratio(sum((x) => x.ingredientsMatched), sum((x) => x.ingredientsPredicted)) : null,
    stepCer: ratio(sum((x) => x.stepEdits), sum((x) => x.stepTruthChars)),
    stepCountMatch: rate(s.map((x) => x.stepCountMatch)),
    title: rate(s.map((x) => x.title)),
    servings: rate(s.map((x) => x.servings)),
    withinTwoEdits: rate(s.map((x) => (x.edits === null ? null : x.edits <= 2))),
    gatePass: rate(photos.map((p) => p.gatePassed)),
  };
}
