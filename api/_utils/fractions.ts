// Recovering vulgar fractions (½ ¼ ⅓ …) that Tesseract misreads.
//
// Recipe amounts use fraction glyphs, and Tesseract almost never reads them on
// a photo: "1½" comes back as "1%", "½" as "¥", "Ya" or a plain "2", "¼" as
// "V4", "⅓" as "5". A misread like "5 tsp salt" for "⅓ tsp salt" is the most
// dangerous OCR error there is, because it looks right.
//
// The OCR engine finds candidate tokens here, crops the glyph from the image
// and re-reads its numerator (top left) and denominator (bottom right) as
// single digits. This module holds the pure parts: which tokens are
// candidates, and what the evidence adds up to. It only ever answers with a
// fraction it can stand behind; otherwise the OCR text is left as it was.

export interface CandidateWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  symbols?: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[];
}

const BULLET_RE = /^[#@©®¢&•*+|«»~]+$/;
// "1%", "%", "¥", "3¥", "V4", "Ya", "%4"
const ODD_TOKEN_RE = /^\d{0,2}[%¥]$|^[VYy][0-9a-z]$|^%\d$/;

// Misreads that point at one fraction only. "%" is not here: Tesseract reads
// both ½ and ¼ as "%", so it needs the image to decide.
const TOKEN_HINTS: Record<string, string> = {
  V2: '½', Y2: '½', Ya: '½', Ye: '½', Yz: '½', '¥': '½',
  V4: '¼', '%4': '¼',
  V3: '⅓', Ys: '⅓',
  V8: '⅛',
};

const FRACTIONS: Record<string, string> = {
  '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾', '1/8': '⅛',
};

export interface FractionCandidate {
  /** Index of the word in its line. */
  index: number;
  /** Whole-number digits before the fraction ("1" of "1%"), kept as they are. */
  lead: string;
  /** Image region holding the fraction glyph, before trimming to the ink. */
  region: { left: number; top: number; width: number; height: number };
}

/**
 * Finds words in one OCR line that may be a misread fraction: an odd token at
 * the start of the line (after any bullet glyphs) or after "of" ("juice of ¥
 * lime"), or a lone digit at the start that is too wide for a digit.
 */
export function findFractionCandidates(words: CandidateWord[], digitWidth: number): FractionCandidate[] {
  const found: FractionCandidate[] = [];
  for (let i = 0; i < Math.min(words.length, 4); i++) {
    const w = words[i];
    const atStart = words.slice(0, i).every((p) => BULLET_RE.test(p.text));
    const width = w.bbox.x1 - w.bbox.x0;
    const wideDigit = /^\d$/.test(w.text) && width > digitWidth * 1.5 && width < digitWidth * 3;
    const odd = ODD_TOKEN_RE.test(w.text);
    const afterOf = i > 0 && /^of$/i.test(words[i - 1].text);
    if (!((atStart && (odd || wideDigit)) || (afterOf && odd))) continue;
    // An amount is followed by its ingredient, never by a bullet: "¥ & 1 onion"
    // is edge noise in front of a bulleted line, not "½"
    if (words[i + 1] && BULLET_RE.test(words[i + 1].text)) continue;

    const lead = (w.text.match(/^\d+(?=[%¥])/) ?? [''])[0];
    // The glyph starts after the whole-number digits (or the word before) and
    // ends before the next word. Tesseract's own box for "%" can cut the glyph
    // short, so the region is taken from the neighbours instead.
    const leadEnd = lead ? w.symbols?.[lead.length - 1]?.bbox.x1 : undefined;
    const left =
      leadEnd !== undefined ? leadEnd + 1 : i > 0 ? Math.max(words[i - 1].bbox.x1 + 1, w.bbox.x0 - digitWidth) : w.bbox.x0 - 3;
    const right = words[i + 1] ? Math.min(words[i + 1].bbox.x0 - 1, w.bbox.x1 + digitWidth) : w.bbox.x1 + 3;
    const height = w.bbox.y1 - w.bbox.y0;
    const top = w.bbox.y0 - Math.round(height * 0.3);
    found.push({
      index: i,
      lead,
      region: { left: Math.max(0, left), top: Math.max(0, top), width: Math.max(1, right - left), height: Math.round(height * 1.6) },
    });
  }
  return found;
}

/**
 * Decides the fraction from the token and the digits re-read from the glyph.
 * Returns the replacement word ("1½", "¼") or null to leave the OCR text alone.
 */
export function resolveFraction(token: string, lead: string, numerator: string, denominator: string): string | null {
  const hint = TOKEN_HINTS[token.slice(lead.length)];
  // What the image says: both digits, or a lone 2 below the line (only ½ has it)
  const fromImage = FRACTIONS[`${numerator}/${denominator}`] ?? (denominator === '2' && numerator === '' ? '½' : undefined);
  let glyph: string | undefined;
  if (fromImage) {
    // The image is used, but never against a misread that points elsewhere
    if (hint && hint !== fromImage) return null;
    glyph = fromImage;
  } else if (hint && (denominator === '' || FRACTIONS[`1/${denominator}`] === hint)) {
    // A token hint stands when the image read no contradicting denominator
    glyph = hint;
  }
  if (!glyph) return null;
  return `${lead}${glyph}`;
}

/** Typical width of one digit on the page, from words that are plain numbers. */
export function typicalDigitWidth(words: CandidateWord[]): number {
  const widths = words
    .filter((w) => /^\d+$/.test(w.text))
    .map((w) => (w.bbox.x1 - w.bbox.x0) / w.text.length)
    .sort((a, b) => a - b);
  return widths.length ? widths[Math.floor(widths.length / 2)] : 12;
}

/**
 * The box of one quarter of a glyph (numerator top left, denominator bottom
 * right), clamped inside the glyph. Rounding the offset and the size separately
 * can overshoot by a pixel (0.42 × 75 and 0.58 × 75 both end in .5), which
 * sharp rejects, so the size is derived from what is left after the offset.
 */
export function quarterBox(
  size: { width: number; height: number },
  left: number,
  top: number,
): { left: number; top: number; width: number; height: number } {
  const x = Math.min(Math.round(size.width * left), size.width - 1);
  const y = Math.min(Math.round(size.height * top), size.height - 1);
  return {
    left: x,
    top: y,
    width: Math.max(1, Math.min(size.width - x, Math.max(2, Math.round(size.width * 0.58)))),
    height: Math.max(1, Math.min(size.height - y, Math.max(2, Math.round(size.height * 0.58)))),
  };
}
