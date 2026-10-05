import type { Ingredient } from '../../types';
import { singularWord } from './words';

// Measures too loose to add up ("a handful", "a pinch"). They lead an
// ingredient's text as often as a real unit does.
export const VAGUE_MEASURE_WORDS =
  'handful|pinch|dash|splash|knob|drizzle|glug|sprig|bunch|squeeze|few|grating';

// "a handful of coriander", "2 handfuls of spinach", "handful fresh coriander".
// The "of" is optional because recipes drop it as often as not.
export const LEADING_VAGUE_MEASURE = new RegExp(
  `^(?:a|an|\\d+(?:[./]\\d+)?)?\\s*(${VAGUE_MEASURE_WORDS})s?\\s+(?:of\\s+)?`
);

// Every way a recipe writes a unit in free text, for spotting amounts written
// into an ingredient's name rather than its quantity and unit fields.
export const AMOUNT_UNIT_WORDS = [
  'g', 'kg', 'mg', 'ml', 'l', 'oz', 'lb', 'lbs', 'tsp', 'tbsp', 'cup', 'cups',
  'gram', 'grams', 'kilogram', 'kilograms', 'ounce', 'ounces', 'pound', 'pounds',
  'milliliter', 'millilitre', 'milliliters', 'millilitres', 'liter', 'litre',
  'liters', 'litres', 'teaspoon', 'teaspoons', 'tablespoon', 'tablespoons',
  'pinch', 'dash', 'handful', 'clove', 'cloves', 'can', 'cans', 'tin', 'tins',
  'jar', 'jars', 'pack', 'packs', 'packet', 'packets', 'bunch', 'bunches', 'bag', 'bags',
  'slice', 'slices', 'piece', 'pieces',
];

// A number leading an ingredient's name, with or without a unit ("2 shallots",
// "400g chopped tomatoes"). A leading zero is part of a name ("00 flour").
const LEADING_NUMBER = '((?:[1-9]\\d*|0)(?:[./]\\d+)?|[¼½¾⅓⅔⅛])';
export const LEADING_AMOUNT = new RegExp(
  `^${LEADING_NUMBER}\\s*(?:(?:${AMOUNT_UNIT_WORDS.join('|')})\\.?\\s+|\\s+(?=[a-z]))`
);
const LEADING_COUNT = new RegExp(`^${LEADING_NUMBER}\\s+([a-z]+)`);

const UNICODE_FRACTIONS: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };

/**
 * The count an ingredient's name leads with when no unit follows it ("2
 * shallots" → 2), for lines that put the amount in the name instead of the
 * quantity field. 0 when there isn't one.
 */
export function leadingCount(name: string): number {
  const match = name.trim().toLowerCase().match(LEADING_COUNT);
  if (!match || AMOUNT_UNIT_WORDS.includes(match[2])) return 0;
  const number = match[1];
  if (number in UNICODE_FRACTIONS) return UNICODE_FRACTIONS[number];
  const [numerator, denominator] = number.split('/').map(Number);
  return denominator ? numerator / denominator : numerator;
}

/**
 * The loose measure an ingredient's name leads with, for lines that carry the
 * amount in the name instead of the unit field ("a handful of coriander").
 */
function leadingVagueUnit(name: string): string {
  return name.toLowerCase().trim().match(LEADING_VAGUE_MEASURE)?.[1] ?? '';
}

/** The unit an ingredient is measured in, falling back to one named in its text. */
export function ingredientUnit(ingredient: Pick<Ingredient, 'name' | 'unit'>): string {
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

export const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * How many whole items to buy. Scaling a recipe leaves fractions of things
 * sold whole ("5 ⅔ spring onions"); the shop sells them in ones, so round up.
 */
function wholeItemsToBuy(quantity: number): number {
  return Math.ceil(round2(quantity));
}

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

// Fractions a cook reads at a glance. Anything within FRACTION_TOLERANCE of one
// snaps to it, so scaled or summed thirds ("0.33 + 0.33") still read "⅔".
const COMMON_FRACTIONS: ReadonlyArray<readonly [number, string]> = [
  [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾'],
];
const FRACTION_TOLERANCE = 0.02;

export function formatQuantity(quantity: number): string {
  if (quantity === Math.floor(quantity)) return String(quantity);
  const whole = Math.floor(quantity);
  const remainder = quantity - whole;
  if (remainder > 1 - FRACTION_TOLERANCE) return String(whole + 1);
  if (remainder < FRACTION_TOLERANCE) return String(whole);
  const fraction = COMMON_FRACTIONS.find(([value]) => Math.abs(remainder - value) < FRACTION_TOLERANCE);
  if (fraction) return whole > 0 ? `${whole} ${fraction[1]}` : fraction[1];
  return String(round2(quantity));
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
    group.byUnit.set(normUnit, (group.byUnit.get(normUnit) ?? 0) + quantity);
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
      const [unit, rawQuantity] = entries[0];
      const quantity = unit ? round2(rawQuantity) : wholeItemsToBuy(rawQuantity);
      // "salt, to taste" arrives as a bare name with no quantity — leave it bare.
      if (quantity <= 0) return '';
      return [formatQuantity(quantity), displayUnit(unit, quantity)].filter(Boolean).join(' ');
    })
    .filter(Boolean);
}

/**
 * Whether the list line should name the ingredient in the plural. Only a
 * single whole item reads singular ("1 lemon"); everything else — several
 * items, or a weight of them — reads plural ("3 shallots", "500 g tomatoes").
 */
export function readsAsPlural(amounts: readonly IngredientAmount[]): boolean {
  const counted = amounts.filter((a) => normalizeUnit(a.unit) === '' && a.quantity > 0);
  if (counted.length === 0) return true;
  return wholeItemsToBuy(counted.reduce((sum, a) => sum + a.quantity, 0)) > 1;
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
