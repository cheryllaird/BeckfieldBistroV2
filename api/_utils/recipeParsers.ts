// Shared non-AI recipe parsers used by /api/extract-recipe — the OCR-text
// fallback (parseRecipeText) and the URL JSON-LD structuring.

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

export function parseIngredientLine(line: string): Ingredient {
  const trimmed = line.trim();

  const qtyRe = /^([\d]+(?:[.,]\d+)?(?:\s*[/⁄]\s*[\d]+)?(?:\s*[¼½¾⅓⅔⅛])?)/;
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

  let quantity = 0;
  if (quantityStr) {
    const normalized = quantityStr
      .replace('¼', '0.25').replace('½', '0.5').replace('¾', '0.75')
      .replace('⅓', '0.333').replace('⅔', '0.667').replace('⅛', '0.125');
    if (normalized.includes('/')) {
      const parts = normalized.split('/');
      const num = parseFloat(parts[0].trim());
      const den = parseFloat(parts[1].trim());
      quantity = den ? num / den : 0;
    } else {
      quantity = parseFloat(normalized.replace(',', '.')) || 0;
    }
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

function groupSteps(stepLines: string[]): string[] {
  const lines = stepLines.filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  // Numbered method: one step per number, continuation lines appended
  if (lines.some((l) => NUMBERED_STEP_RE.test(l))) {
    const steps: string[] = [];
    let current = '';
    for (const line of lines) {
      const m = line.match(/^\d+[.)]\s*(.*)$/);
      if (m) {
        if (current.trim()) steps.push(current.trim());
        current = m[1];
      } else {
        current = current ? `${current} ${line}` : line;
      }
    }
    if (current.trim()) steps.push(current.trim());
    return steps;
  }

  // Unnumbered method: OCR gives one line per printed line, so re-join and
  // split on sentence boundaries instead of treating each line as a step.
  const blob = lines.join(' ').replace(/\s+/g, ' ').trim();
  return blob
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseRecipeText(ocrText: string): ParsedRecipeText {
  // Re-join words hyphenated across line breaks before splitting into lines
  const lines = ocrText
    .replace(/-\n\s*/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);

  let servings = 0;
  let prepTime = '';
  let totalTime = '';
  for (const line of lines) {
    if (!servings) servings = matchServings(line) ?? 0;
    if (!prepTime) prepTime = matchPrepTime(line) ?? '';
    if (!totalTime) totalTime = matchTotalTime(line) ?? '';
  }

  const ingredientsStart = lines.findIndex((l) => INGREDIENTS_HEADER_RE.test(l));
  const methodStart = lines.findIndex((l) => METHOD_HEADER_RE.test(l));

  let ingredientLines: string[];
  let stepLines: string[];

  if (ingredientsStart >= 0 && methodStart > ingredientsStart) {
    ingredientLines = lines.slice(ingredientsStart + 1, methodStart);
    stepLines = lines.slice(methodStart + 1);
  } else if (ingredientsStart >= 0) {
    // No method header: ingredients run until the first numbered step or the
    // first long prose line that doesn't start with an amount
    const rest = lines.slice(ingredientsStart + 1);
    let split = rest.findIndex(
      (l) => NUMBERED_STEP_RE.test(l) || (l.length > 60 && !QUANTITY_START_RE.test(l)),
    );
    if (split === -1) split = rest.length;
    ingredientLines = rest.slice(0, split);
    stepLines = rest.slice(split);
  } else if (methodStart >= 0) {
    ingredientLines = lines
      .slice(0, methodStart)
      .filter((l) => QUANTITY_START_RE.test(l) && !NUMBERED_STEP_RE.test(l) && !isMetadataLine(l));
    stepLines = lines.slice(methodStart + 1);
  } else {
    // No explicit "Ingredients"/"Method" headers (common in cookbooks that use
    // "For the curry" style sub-headings instead). Ingredients are the
    // contiguous block of amount-led lines; bound to that block so method prose
    // that happens to start with a number ("4 minutes, stirring…") can't leak
    // in, and keep section sub-headers inside the block so they title sections.
    // Amount-led, but not a method sentence that merely opens with a number
    // ("4 minutes, stirring…"): ingredient lines are short and lack a mid-line
    // sentence break.
    const isAmount = (l: string) =>
      QUANTITY_START_RE.test(l) &&
      !NUMBERED_STEP_RE.test(l) &&
      !isMetadataLine(l) &&
      l.length <= 60 &&
      !/[a-z]\.\s/.test(l);
    const amountIdx = lines.map((l, i) => (isAmount(l) ? i : -1)).filter((i) => i >= 0);

    if (amountIdx.length > 0) {
      const first = amountIdx[0];
      const last = amountIdx[amountIdx.length - 1];
      // Sub-headers use the same test as the section splitter below, so the two
      // cannot drift: a line admitted here as a header is one there too. It is
      // narrow enough not to swallow wrapped ingredient continuations ("cut into …").
      const isSubHeader = looksLikeSectionHeader;
      ingredientLines = lines.slice(first, last + 1).filter((l) => isAmount(l) || isSubHeader(l));
      if (first > 0 && isSubHeader(lines[first - 1])) ingredientLines.unshift(lines[first - 1]);
      stepLines = lines
        .slice(last + 1)
        .filter((l) => NUMBERED_STEP_RE.test(l) || (l.length > 40 && !QUANTITY_START_RE.test(l) && !isMetadataLine(l)));
    } else {
      ingredientLines = [];
      stepLines = lines.filter(
        (l) => NUMBERED_STEP_RE.test(l) || (l.length > 40 && !isMetadataLine(l)),
      );
    }
  }

  const titleZoneEnd = ingredientsStart >= 0 ? ingredientsStart : methodStart >= 0 ? methodStart : Math.min(lines.length, 5);
  const title =
    lines
      .slice(0, titleZoneEnd)
      .find((l) => /[a-zA-Z]{3,}/.test(l) && !isMetadataLine(l) && !QUANTITY_START_RE.test(l)) ?? 'Scanned Recipe';

  return {
    title,
    servings: servings || 4,
    prepTime,
    totalTime,
    ingredientSections: buildIngredientSections(ingredientLines),
    steps: groupSteps(stepLines),
  };
}
