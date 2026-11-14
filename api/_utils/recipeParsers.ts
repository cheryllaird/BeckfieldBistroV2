// Shared non-AI recipe parsers used by /api/extract-recipe — the OCR-text
// fallback (parseRecipeText) and the URL JSON-LD structuring.

import {
  cleanLine,
  continuesIngredient,
  isMagazineStep,
  isNoiseLine,
  isNutritionLine,
  realWords,
  splitAtBullets,
  wordLikeRatio,
  type OcrLine,
} from './ocrLines.js';

export interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
  originalText: string;
}

export interface IngredientSection {
  title: string;
  ingredients: Ingredient[];
}

export function parseIsoDuration(iso: string | undefined): string {
  if (!iso) return '';
  const h = iso.match(/(\d+)H/i);
  const m = iso.match(/(\d+)M/i);
  const hours = h ? parseInt(h[1], 10) : 0;
  const mins = m ? parseInt(m[1], 10) : 0;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  if (mins) return `${mins} mins`;
  return '';
}

const UNICODE_FRACTIONS: Record<string, number> = {
  '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 0.333, '⅔': 0.667, '⅛': 0.125,
};

export function parseIngredientLine(line: string): Ingredient {
  const trimmed = line.trim();

  // An amount: a number, decimal or fraction with an optional trailing unicode
  // fraction ("1½", "1 ½"), or a unicode fraction on its own ("½")
  const qtyRe = /^(\d+(?:[.,]\d+)?(?:\s*[/⁄]\s*\d+)?(?:\s*[¼½¾⅓⅔⅛])?|[¼½¾⅓⅔⅛])/;
  const qtyMatch = trimmed.match(qtyRe);
  const quantityStr = qtyMatch?.[1]?.trim() ?? '';
  const remainder = trimmed.slice(quantityStr.length).trim();

  const unitWords = [
    'cup','cups','tbsp','tablespoon','tablespoons','tsp','teaspoon','teaspoons',
    'oz','ounce','ounces','lb','pound','pounds','g','gram','grams','kg','kilogram',
    'ml','milliliter','millilitre','l','liter','litre','liters','litres',
    'clove','cloves','slice','slices','piece','pieces','bunch','handful',
    'pinch','dash','can','cans','package','packages','pkg','sprig','sprigs',
    'stalk','stalks','head','heads',
  ];
  const unitRe = new RegExp(`^(${unitWords.join('|')})\\b`, 'i');
  const unitMatch = remainder.match(unitRe);
  const unit = unitMatch?.[1]?.toLowerCase() ?? '';
  // Strip separators and a literal "of " ("2 cups of flour") — as two steps,
  // because a character class like [\s,of] would eat the o of "olive oil"
  const name = remainder.slice(unit.length).replace(/^[\s,]+/, '').replace(/^of\s+/i, '').trim();

  // The unicode fraction is added to the whole-number part, not spliced into
  // its text — replacing "½" with "0.5" in "1½" gave "10.5"
  let quantity = 0;
  if (quantityStr) {
    const fractionChar = quantityStr.match(/[¼½¾⅓⅔⅛]/)?.[0];
    const fraction = fractionChar ? UNICODE_FRACTIONS[fractionChar] : 0;
    const whole = quantityStr.replace(/[¼½¾⅓⅔⅛]/, '').trim();
    let wholeValue = 0;
    if (/[/⁄]/.test(whole)) {
      const [num, den] = whole.split(/[/⁄]/).map((part) => parseFloat(part.trim()));
      wholeValue = den ? num / den : 0;
    } else if (whole) {
      wholeValue = parseFloat(whole.replace(',', '.')) || 0;
    }
    quantity = wholeValue + fraction;
  }

  return { name: name || trimmed, quantity, unit, originalText: trimmed };
}

// JSON-LD step text sometimes carries HTML (embedded <p>/<br>) or entities;
// strip them so a step reads as plain prose.
function cleanStepText(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Flattens a schema.org `recipeInstructions` value into an ordered list of step
// strings. schema.org permits it to be a single Text value, an array of strings,
// or nested HowToStep/HowToSection objects — and real sites use all three, so
// every shape is normalized here.
//
// Two shapes the previous version mishandled and that showed up as a "missing
// method" on some recipe pages:
//   1. A single Text string. Iterating it with `for..of` walked it character by
//      character; it is now wrapped so the whole method is split into steps on
//      its block separators (newlines, <p>/<br>/<li>) instead.
//   2. A grouping node (HowToSection / ItemList / untyped wrapper) whose
//      `@type` was absent or not exactly "HowToSection" — its nested
//      `itemListElement` is now recursed into regardless of `@type`.
export function flattenInstructions(instructions: unknown): string[] {
  // A bare string must not be iterated as characters — wrap non-arrays.
  const list = Array.isArray(instructions) ? instructions : [instructions];
  const steps: string[] = [];
  for (const item of list) {
    if (typeof item === 'string') {
      // A single Text value can hold the whole method; split on block-level
      // separators, falling back to the whole string as one step.
      for (const part of item.split(/\r?\n|<\/?(?:p|br|li|div)\b[^>]*>/i)) {
        const text = cleanStepText(part);
        if (text) steps.push(text);
      }
    } else if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      // Recurse into any grouping node that carries a nested step list,
      // whatever its @type (HowToSection, ItemList, or an untyped wrapper).
      const nested = obj.itemListElement ?? obj.steps ?? obj.recipeInstructions;
      if (Array.isArray(nested)) {
        steps.push(...flattenInstructions(nested));
      } else {
        const text = obj.text ?? obj.name ?? obj.description;
        if (text != null) {
          const cleaned = cleanStepText(String(text));
          if (cleaned) steps.push(cleaned);
        }
      }
    }
  }
  return steps.filter(Boolean);
}

// "For the dressing", "To serve", "To make the paste" — a heading announces the
// group that follows. The prefix must be followed by a word so a bare "For" or
// an ingredient opening with "Fortified…" cannot match.
const HEADER_PREFIX_RE = /^(?:for\s+(?:the\s+|a\s+)?\S|to\s+(?:make|serve|assemble|finish|garnish)\b)/i;
// A bare component name on its own line ("Dressing", "GARNISH"). Anchored at both
// ends: "Dressing" is a heading, "Dressing of choice" is an ingredient.
const HEADER_WORD_RE =
  /^(?:sauce|dressing|marinade|topping|toppings|garnish|glaze|filling|crust|batter|coating|salad|dip|base|paste|seasoning|assembly)$/i;

// Whether a line titles a group of ingredients rather than being one.
//
// A heading must show POSITIVE evidence of being one. The absence of a quantity
// is not evidence: unquantified ingredients are ordinary ("Thai chillies, to
// taste", "Salt", "Fresh cilantro for garnish"). An earlier rule here treated
// any line the quantity parser couldn't read as a heading, which turned every
// such ingredient into a section title and split the list at that point —
// hot-thai-kitchen.com's papaya salad broke at "Thai chillies, to taste".
export function looksLikeSectionHeader(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 60) return false;
  // If it starts with a digit or fraction character it's an ingredient amount
  if (/^[\d¼½¾⅓⅔⅛]/.test(trimmed)) return false;
  // Explicit trailing punctuation is the strongest signal — a colon, or the
  // slash some cookbook layouts use ("For the curry /")
  if (/[:/]\s*$/.test(trimmed)) return true;
  if (HEADER_PREFIX_RE.test(trimmed)) return true;
  // Case-insensitive, so all-caps headings ("DRESSING") are covered too
  if (HEADER_WORD_RE.test(trimmed)) return true;
  return false;
}

export function buildIngredientSections(lines: string[]): IngredientSection[] {
  const sections: IngredientSection[] = [];
  let current: IngredientSection = { title: '', ingredients: [] };

  for (const line of lines) {
    if (looksLikeSectionHeader(line)) {
      if (current.ingredients.length > 0) sections.push(current);
      current = { title: line.trim().replace(/[\s/:]+$/, ''), ingredients: [] };
    } else {
      current.ingredients.push(parseIngredientLine(line));
    }
  }
  if (current.ingredients.length > 0 || sections.length === 0) sections.push(current);
  return sections;
}

// ─── OCR text fallback parser ────────────────────────────────────────────────
// Last-resort structuring when Gemini is unavailable or blocked: the user still
// gets a result built from the verbatim OCR text, editable in the recipe form.

export interface ParsedRecipeText {
  title: string;
  servings: number;
  prepTime: string;
  totalTime: string;
  ingredientSections: IngredientSection[];
  steps: string[];
}

// Starts with a digit or unicode fraction — an amount, not prose
const QUANTITY_START_RE = /^[\d¼½¾⅓⅔⅛]/;
const NUMBERED_STEP_RE = /^\d+[.)]\s/;
// Headers must be the whole line (bare word + optional punctuation) so that
// metadata like "Preparation time: 15 mins" is not mistaken for a header.
const INGREDIENTS_HEADER_RE = /^ingredients[\s:.]*$/i;
const METHOD_HEADER_RE = /^(?:method|directions|instructions|steps|preparation)[\s:.]*$/i;

function matchServings(line: string): number | null {
  const m =
    line.match(/serves\s+(\d+)/i) ??
    line.match(/(\d+)\s+servings?\b/i) ??
    line.match(/servings?[:\s]+(\d+)/i) ??
    line.match(/makes\s+(\d+)\b/i);
  return m ? parseInt(m[1], 10) : null;
}

// Metadata often shares a line ("Serves 4 · Prep: 15 mins · Total: 40 mins"),
// so cut the capture at the next spaced separator. Hyphens inside a value
// ("1-1.5 hours") have no surrounding spaces and survive.
function firstMetaValue(captured: string): string {
  return captured.split(/\s+[-–—|•·]\s+/)[0].trim().slice(0, 40);
}

// Only treat a line as time metadata when it carries an explicit "time" label
// or a colon after the keyword — otherwise "cook for 5 minutes" in a method
// sentence would be misread as the total time (and drop the step).
function matchPrepTime(line: string): string | null {
  const m =
    line.match(/prep(?:aration)?\s*time\s*[:\s]\s*([^|•·]+)/i) ??
    line.match(/prep(?:aration)?\s*:\s*([^|•·]+)/i);
  return m ? firstMetaValue(m[1]) : null;
}

function matchTotalTime(line: string): string | null {
  const m =
    line.match(/(?:total|cook(?:ing)?)\s*time\s*[:\s]\s*([^|•·]+)/i) ??
    line.match(/(?:total|cook(?:ing)?)\s*:\s*([^|•·]+)/i);
  return m ? firstMetaValue(m[1]) : null;
}

function isMetadataLine(line: string): boolean {
  return matchServings(line) !== null || matchPrepTime(line) !== null || matchTotalTime(line) !== null;
}

// "1. Heat…", "2) Add…", or magazine style "3 Stir in…" — the text after the number
function stepStartText(line: string): string | null {
  const m = line.match(/^\d+[.)]\s*(.*)$/);
  if (m) return m[1];
  return isMagazineStep(line) ? line.replace(/^\d{1,2}\s+/, '') : null;
}

function splitParagraphs(lines: string[]): string[] {
  if (lines.length < 4) return [];
  const sorted = lines.map((l) => l.length).sort((a, b) => a - b);
  const typical = sorted[Math.floor(sorted.length / 2)];
  if (typical < 30) return [];
  const paragraphs: string[] = [];
  let current: string[] = [];
  lines.forEach((line, i) => {
    current.push(line);
    const endsParagraph = /[.!?)]["'’”]?$/.test(line) && line.length < typical * 0.8;
    if (endsParagraph || i === lines.length - 1) {
      paragraphs.push(current.join(' ').replace(/\s+/g, ' ').trim());
      current = [];
    }
  });
  return paragraphs.filter(Boolean);
}

function groupSteps(stepLines: string[]): string[] {
  const lines = stepLines.filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  // Numbered method: one step per number, continuation lines appended
  if (lines.some((l) => stepStartText(l) !== null)) {
    const steps: string[] = [];
    let current = '';
    for (const line of lines) {
      const m = stepStartText(line);
      if (m !== null) {
        if (current.trim()) steps.push(current.trim());
        current = m;
      } else {
        current = current ? `${current} ${line}` : line;
      }
    }
    if (current.trim()) steps.push(current.trim());
    return steps;
  }

  // Unnumbered method: OCR gives one line per printed line. Cookbooks print each
  // step as a paragraph, and a paragraph's last line is the one that ends a
  // sentence well short of the column width — so split there when there is
  // enough text to judge the width.
  const paragraphs = splitParagraphs(lines);
  if (paragraphs.length >= 2) return paragraphs;

  // Otherwise re-join and split on sentence boundaries instead of treating
  // each line as a step.
  const blob = lines.join(' ').replace(/\s+/g, ' ').trim();
  return blob
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Labels and straplines near the top of a page that are never the recipe title
const TITLE_LABEL_RE =
  /^(?:vegetarian|vegan|serves|makes|equipment|ingredients|method|you will (?:also )?need|per serving|swaps|goes well with)\b|\brecipes?$/i;

function isTitleCandidate(text: string): boolean {
  return (
    text.length <= 70 &&
    !/^['"‘“]/.test(text) && // pull-quotes and intro text open with a quote mark
    !QUANTITY_START_RE.test(text) &&
    !isMetadataLine(text) &&
    !isNutritionLine(text) &&
    !TITLE_LABEL_RE.test(text) &&
    !/[.!?:/]\s*$/.test(text) &&
    realWords(text).length >= 2 &&
    wordLikeRatio(text) >= 0.75
  );
}

const isAllCaps = (text: string) => /\p{Lu}/u.test(text) && text === text.toUpperCase();

// Cookbook titles are often set in capitals and wrap over two lines ("BEETROOT
// CURRY WITH" / "A COCONUT SAMBOL"), sometimes with a lower-case subtitle line
// ("with green bean mallum"). Prefer the first capitals line and join what wraps.
function findTitle(lines: string[]): string {
  const candidates = lines.map(isTitleCandidate);
  let i = lines.findIndex((l, k) => candidates[k] && isAllCaps(l));
  if (i === -1) i = candidates.indexOf(true);
  if (i === -1) return 'Scanned Recipe';
  let title = lines[i];
  const next = lines[i + 1];
  if (
    next !== undefined &&
    ((isAllCaps(title) && isAllCaps(next) && wordLikeRatio(next) >= 0.75 && !TITLE_LABEL_RE.test(next)) ||
      /^with\s/i.test(next))
  ) {
    title = `${title} ${next}`;
  }
  return title;
}

// Joins wrapped ingredient lines ("1 cucumber, halved" + "lengthways") and keeps
// section headers; drops everything else in the block (stray OCR fragments).
function ingredientBlockLines(block: OcrLine[], isIngredient: (l: OcrLine) => boolean, bulletedList: boolean): string[] {
  const out: string[] = [];
  let prev: OcrLine | null = null;
  for (const line of block) {
    if (looksLikeSectionHeader(line.text)) {
      out.push(line.text);
      prev = null;
    } else if (prev && continuesIngredient(prev, line, bulletedList)) {
      out[out.length - 1] = `${out[out.length - 1]} ${line.text}`;
      prev = { ...line, text: out[out.length - 1] };
    } else if (isIngredient(line)) {
      out.push(line.text);
      prev = line;
    }
  }
  return out;
}

// A method line worth keeping: two real words at least, and not a
// capitals-only label such as "PER SERVING" or "YOU WILL NEED".
function isStepText(text: string): boolean {
  if (NUMBERED_STEP_RE.test(text)) return true;
  if (isMetadataLine(text) || isNutritionLine(text)) return false;
  if (isAllCaps(text) && text.length < 30) return false;
  const words = realWords(text).length;
  // One word is enough for the wrapped end of a sentence ("cover.") or a
  // lower-case continuation; a lone capitalised word is more likely a label.
  return words >= 2 || (words === 1 && (/[.!?]$/.test(text) || /^\p{Ll}/u.test(text)));
}

export function parseRecipeText(ocrText: string): ParsedRecipeText {
  // Re-join words hyphenated across line breaks, then clean each line (bullets,
  // edge noise, unit misreads) and drop junk lines entirely
  const all = ocrText
    .replace(/-\n\s*/g, '')
    .split('\n')
    .flatMap(splitAtBullets)
    .map(cleanLine)
    .filter((l) => l.text.length > 0);

  // Metadata is read before junk is dropped: "SERVES 4 V Vn DF" looks like
  // noise because of its diet badges, but still carries the servings.
  let servings = 0;
  let prepTime = '';
  let totalTime = '';
  for (const { text } of all) {
    if (!servings) servings = matchServings(text) ?? 0;
    if (!prepTime) prepTime = matchPrepTime(text) ?? '';
    if (!totalTime) totalTime = matchTotalTime(text) ?? '';
  }

  // Junk, nutrition boxes and page furniture never belong in any field
  const content = all.filter((l) => !isNoiseLine(l.text) && !isNutritionLine(l.text));
  const lines = content.map((l) => l.text);

  const ingredientsStart = lines.findIndex((l) => INGREDIENTS_HEADER_RE.test(l));
  const methodStart = lines.findIndex((l) => METHOD_HEADER_RE.test(l));

  // Amount-led or bulleted, but not a method sentence that merely opens with a
  // number ("4 minutes, stirring…" or "2 Add the pepper…"): ingredient lines are
  // short and lack a mid-line sentence break.
  const isIngredient = (l: OcrLine) =>
    (QUANTITY_START_RE.test(l.text) || l.bulleted) &&
    !NUMBERED_STEP_RE.test(l.text) &&
    !isMagazineStep(l.text) &&
    !isMetadataLine(l.text) &&
    l.text.length <= 60 &&
    !/[a-z]\.\s/.test(l.text);
  const bulletedList = content.filter((l) => l.bulleted && isIngredient(l)).length >= 3;

  let ingredientLines: string[];
  let stepLines: string[];
  let titleZoneEnd: number;

  if (ingredientsStart >= 0 && methodStart > ingredientsStart) {
    ingredientLines = ingredientBlockLines(
      content.slice(ingredientsStart + 1, methodStart),
      () => true,
      bulletedList,
    );
    stepLines = lines.slice(methodStart + 1).filter(isStepText);
    titleZoneEnd = ingredientsStart;
  } else if (ingredientsStart >= 0) {
    // No method header: ingredients run until the first numbered step or the
    // first long prose line that doesn't start with an amount
    const rest = content.slice(ingredientsStart + 1);
    let split = rest.findIndex(
      (l) =>
        NUMBERED_STEP_RE.test(l.text) ||
        isMagazineStep(l.text) ||
        (l.text.length > 60 && !QUANTITY_START_RE.test(l.text)),
    );
    if (split === -1) split = rest.length;
    ingredientLines = ingredientBlockLines(rest.slice(0, split), isIngredient, bulletedList);
    stepLines = rest.slice(split).map((l) => l.text).filter(isStepText);
    titleZoneEnd = ingredientsStart;
  } else if (methodStart >= 0) {
    ingredientLines = ingredientBlockLines(content.slice(0, methodStart), isIngredient, bulletedList);
    stepLines = lines.slice(methodStart + 1).filter(isStepText);
    titleZoneEnd = methodStart;
  } else {
    // No explicit "Ingredients"/"Method" headers (common in cookbooks that use
    // "For the curry" style sub-headings instead). Ingredients are the runs of
    // ingredient lines, with section headers and wrapped continuations inside a
    // run and at most one stray line between ingredients. A lone amount-led line
    // elsewhere (a page number, "2 x 400g" in the intro) forms a run of one and
    // is ignored, so it can no longer stretch the block over the method.
    const runs: { start: number; end: number; count: number }[] = [];
    let run: { start: number; end: number; count: number } | null = null;
    let gap = 0;
    content.forEach((l, i) => {
      if (isIngredient(l)) {
        if (!run) run = { start: i, end: i, count: 0 };
        run.count++;
        run.end = i;
        gap = 0;
      } else if (run) {
        // A continuation must sit directly under the ingredient it continues —
        // never across a stray line, or wrapped method prose gets absorbed.
        if (looksLikeSectionHeader(l.text) || (gap === 0 && continuesIngredient(content[i - 1], l, bulletedList))) {
          run.end = i;
          gap = 0;
        } else if (++gap > 1) {
          runs.push(run);
          run = null;
          gap = 0;
        }
      }
    });
    if (run) runs.push(run);
    const chosen = runs.filter((r) => r.count >= 2);
    if (chosen.length === 0 && runs.length > 0) chosen.push(runs.reduce((a, b) => (b.count > a.count ? b : a)));

    if (chosen.length > 0) {
      const first = chosen[0].start;
      const last = chosen[chosen.length - 1].end;
      ingredientLines = chosen.flatMap((r) =>
        ingredientBlockLines(content.slice(r.start, r.end + 1), isIngredient, bulletedList),
      );
      if (first > 0 && looksLikeSectionHeader(lines[first - 1])) ingredientLines.unshift(lines[first - 1]);
      stepLines = lines.slice(last + 1).filter(isStepText);
      titleZoneEnd = first;
    } else {
      ingredientLines = [];
      stepLines = lines.filter(
        (l) => NUMBERED_STEP_RE.test(l) || (l.length > 40 && isStepText(l)),
      );
      titleZoneEnd = Math.min(lines.length, 5);
    }
  }

  return {
    title: findTitle(lines.slice(0, Math.max(titleZoneEnd, 1))),
    servings: servings || 4,
    prepTime,
    totalTime,
    ingredientSections: buildIngredientSections(ingredientLines),
    steps: groupSteps(stepLines),
  };
}
