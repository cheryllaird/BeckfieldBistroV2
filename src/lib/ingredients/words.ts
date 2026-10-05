// Word-level helpers shared by name canonicalisation, unit handling and
// cupboard matching.

// Plurals the suffix rules below get wrong. "-ies" usually comes from "-y"
// ("cherries"), but these come from "-ie"/"-i"; "-ves" plurals drop an "f".
const IRREGULAR_SINGULARS: Record<string, string> = {
  chillies: 'chilli',
  cookies: 'cookie',
  brownies: 'brownie',
  calories: 'calorie',
  leaves: 'leaf',
  loaves: 'loaf',
  halves: 'half',
  knives: 'knife',
};

export function singularWord(word: string): string {
  if (Object.prototype.hasOwnProperty.call(IRREGULAR_SINGULARS, word)) return IRREGULAR_SINGULARS[word];
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
  // Only the hissing and -o stems take a full "es" plural ("tomatoes", "dishes",
  // "boxes"). Everything else just gained an "s", so stripping "es" would eat a
  // letter of the word itself — that's what turned "oranges" into "orang".
  if (/(?:s|x|z|ch|sh|o)es$/.test(word) && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('is') && word.length > 3) return word.slice(0, -1);
  return word;
}

/** Whether a word reads as a plural ("shallots", but not "hummus"). */
export function isPluralWord(word: string): boolean {
  return singularWord(word) !== word;
}

/** The last word of a name ("onions" in "red onions"), for plural checks. */
export function lastWord(name: string): string {
  return name.slice(Math.max(name.lastIndexOf(' '), name.lastIndexOf('-')) + 1);
}

/** Drops accents so "jalapeño" and "jalapeno", "purée" and "puree" compare equal. */
export function foldDiacritics(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
