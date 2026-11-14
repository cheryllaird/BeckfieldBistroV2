// Column reflow for OCR output.
//
// Recipe pages set ingredients, method and side notes in side-by-side columns
// (two, three, sometimes four). Tesseract's layout analysis often reads straight
// across them, so one OCR line holds the end of an ingredient, a slice of the
// method and a fragment of a side note ("1 tbsp honey (or brown rice syrup Place
// the soy sauce…"). No text parser can untangle that afterwards.
//
// This module rebuilds reading order from word bounding boxes:
//   1. In each OCR line, wide gaps between words are gutter candidates.
//   2. Candidates are clustered by where the next column starts. A real gutter
//      recurs down the page at a consistent x; a stray wide space does not.
//   3. Each gutter is fitted as a slightly sloped line, because hand-held
//      photos are tilted, and is only live over the rows where it was seen.
//   4. A line is split only where it has a real gap on a live gutter, so a
//      full-width line (title, intro) that crosses a gutter stays whole.
//   5. Pieces are read column by column, each top to bottom. Full-width lines
//      above the columns come first and those below come last.
// Pages without a recurring gutter return null and keep Tesseract's own text.
//
// Pure functions over plain data, so they are unit-tested without Tesseract.

interface BBox { x0: number; y0: number; x1: number; y1: number }
interface TWord { text?: string; bbox?: BBox }
interface TLine { text?: string; bbox?: BBox; words?: TWord[] }
interface TPara { lines?: TLine[] }
interface TBlock { paragraphs?: TPara[] }
export interface TesseractData { blocks?: TBlock[] | null }

interface Word { text: string; x0: number; x1: number }
export interface Line {
  words: Word[];
  yTop: number;
  yBottom: number;
}

export function collectLines(data: TesseractData): Line[] {
  const lines: Line[] = [];
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const ln of para.lines ?? []) {
        const words = (ln.words ?? [])
          .filter((w) => (w.text ?? '').trim().length > 0 && w.bbox)
          .map((w) => ({ text: (w.text ?? '').trim(), x0: w.bbox!.x0, x1: w.bbox!.x1 }))
          .sort((a, b) => a.x0 - b.x0);
        if (words.length > 0) {
          lines.push({ words, yTop: ln.bbox?.y0 ?? 0, yBottom: ln.bbox?.y1 ?? ln.bbox?.y0 ?? 0 });
        }
      }
    }
  }
  return lines;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface Gap {
  y: number;
  left: number;
  right: number;
  /** Width of the text between this gap and the previous wide gap (or line start). */
  leftWidth: number;
  /** That text, to tell word fragments from bullet glyphs. */
  leftText: string;
}
interface Gutter {
  /** x of the next column's left edge at row y. */
  edgeAt: (y: number) => number;
  top: number;
  bottom: number;
  support: number;
}

/** Least-squares fit of the next column's left edge, clamped to a plausible tilt. */
function fitGutter(gaps: Gap[], slack: number): Gutter {
  const meanY = gaps.reduce((s, g) => s + g.y, 0) / gaps.length;
  const meanX = gaps.reduce((s, g) => s + g.right, 0) / gaps.length;
  let num = 0;
  let den = 0;
  for (const g of gaps) {
    num += (g.y - meanY) * (g.right - meanX);
    den += (g.y - meanY) ** 2;
  }
  const slope = Math.max(-0.2, Math.min(0.2, den > 0 ? num / den : 0));
  const ys = gaps.map((g) => g.y);
  return {
    edgeAt: (y) => meanX + slope * (y - meanY),
    top: ys.reduce((m, y) => Math.min(m, y), Infinity) - slack,
    bottom: ys.reduce((m, y) => Math.max(m, y), -Infinity) + slack,
    support: gaps.length,
  };
}

/**
 * The x (a candidate's next-column edge) with the most distinct rows within
 * the tolerance either side. `pool` is sorted by `right`; a sliding window
 * keeps this linear, so a page crafted with thousands of gaps stays cheap.
 */
function densestPeak(pool: Gap[], tolerance: number): { best: number; bestRows: number } {
  const rowsInWindow = new Map<number, number>();
  const add = (g: Gap) => rowsInWindow.set(g.y, (rowsInWindow.get(g.y) ?? 0) + 1);
  const remove = (g: Gap) => {
    const n = (rowsInWindow.get(g.y) ?? 0) - 1;
    if (n > 0) rowsInWindow.set(g.y, n);
    else rowsInWindow.delete(g.y);
  };
  let best = pool[0].right;
  let bestRows = 0;
  let lo = 0;
  let hi = 0; // window is pool[lo, hi)
  for (const centre of pool) {
    while (hi < pool.length && pool[hi].right <= centre.right + tolerance) add(pool[hi++]);
    while (pool[lo].right < centre.right - tolerance) remove(pool[lo++]);
    if (rowsInWindow.size > bestRows) {
      bestRows = rowsInWindow.size;
      best = centre.right;
    }
  }
  return { best, bestRows };
}

/**
 * Splits a gutter's evidence into vertical stretches. A gutter is live only
 * where its gaps occur close together; a few gaps that line up by chance at
 * the top and bottom of the page must not make it live over everything in
 * between. Stretches break at a jump of more than about four lines.
 */
function denseStretches(group: Gap[], slack: number, minSupport: number): Gap[][] {
  const maxJump = (slack / 1.5) * 4;
  const sorted = [...group].sort((a, b) => a.y - b.y);
  const stretches: Gap[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].y - sorted[i - 1].y > maxJump) stretches.push([]);
    stretches[stretches.length - 1].push(sorted[i]);
  }
  return stretches.filter((st) => new Set(st.map((g) => g.y)).size >= minSupport);
}

/**
 * Groups gutter candidates whose next-column edges line up. Candidates are
 * sorted by edge x and split where consecutive edges are further apart than
 * the tolerance; a group needs enough rows to be a real gutter.
 *
 * A column has real text to its left, so a recurring gap after a narrow strip
 * is not a column boundary. Two kinds of narrow strip occur: bullet glyphs
 * ("@ 2 red onion"), which stay with their line, and a sliver of the facing
 * page down the photo's left edge ("bay", "ier", "slices"), which is returned
 * separately as the edge so its fragments can be lifted off each line.
 */
function findGutters(
  gaps: Gap[],
  pageWidth: number,
  minSupport: number,
  slack: number,
): { gutters: Gutter[]; edge: Gutter | null } {
  // Peaks, not chains: a mangled column full of wide gaps would chain every
  // candidate across the page into one group. Instead take the x where the most
  // rows have a gap ending, claim the candidates near it, and repeat.
  const tolerance = pageWidth * 0.02;
  let pool = [...gaps].sort((a, b) => a.right - b.right);
  const groups: Gap[][] = [];
  while (pool.length > 0) {
    const { best, bestRows } = densestPeak(pool, tolerance);
    if (bestRows < minSupport) break;
    // Re-centre on the claimed candidates' median so the group sits on the peak
    const claimed = pool.filter((g) => Math.abs(g.right - best) <= tolerance);
    const centre = median(claimed.map((g) => g.right));
    const group = pool.filter((g) => Math.abs(g.right - centre) <= tolerance * 1.5);
    groups.push(group);
    const claimedSet = new Set(group);
    pool = pool.filter((g) => !claimedSet.has(g));
  }
  const minColumnWidth = pageWidth * 0.08;
  const supported = groups.filter((group) => new Set(group.map((g) => g.y)).size >= minSupport);
  const gutters = supported
    .filter((group) => median(group.map((g) => g.leftWidth)) >= minColumnWidth)
    .flatMap((group) => denseStretches(group, slack, minSupport))
    .map((group) => fitGutter(group, slack));
  const edgeGroup = supported.find(
    (group) =>
      median(group.map((g) => g.leftWidth)) < minColumnWidth &&
      median(group.map((g) => g.right)) < pageWidth * 0.25 &&
      group.filter((g) => /\p{L}{2,}/u.test(g.leftText)).length > group.length / 2,
  );
  return { gutters, edge: edgeGroup ? fitGutter(edgeGroup, slack) : null };
}

/**
 * Returns text re-threaded column by column, or null when the page has no
 * recurring gutter (so the caller keeps Tesseract's own text).
 */
const MAX_LINES = 1500;
const MAX_GAPS = 5000;

export function reflowColumns(lines: Line[]): string | null {
  if (lines.length < 6) return null;
  // Pages beyond any real recipe are left to Tesseract's own reading order:
  // the gutter search must stay cheap on input crafted to be huge
  if (lines.length > MAX_LINES) return null;
  let pageWidth = 0;
  for (const l of lines) for (const w of l.words) pageWidth = Math.max(pageWidth, w.x1);
  if (pageWidth <= 0) return null;

  // The typical gap between words sets the scale; a gutter is far wider.
  const wordGaps: number[] = [];
  for (const l of lines) {
    for (let i = 1; i < l.words.length; i++) {
      const g = l.words[i].x0 - l.words[i - 1].x1;
      if (g > 0) wordGaps.push(g);
    }
  }
  const medianGap = median(wordGaps) || 10;
  const minGutter = Math.max(pageWidth * 0.025, medianGap * 3);

  const gaps: Gap[] = [];
  for (const l of lines) {
    let segmentStart = l.words[0].x0;
    for (let i = 1; i < l.words.length; i++) {
      const left = l.words[i - 1].x1;
      const right = l.words[i].x0;
      if (right - left >= minGutter) {
        const leftText = l.words.filter((w) => w.x0 >= segmentStart && w.x1 <= left).map((w) => w.text).join(' ');
        gaps.push({ y: l.yTop, left, right, leftWidth: left - segmentStart, leftText });
        segmentStart = right;
      }
    }
  }

  const pitches: number[] = [];
  const ys = lines.map((l) => l.yTop).sort((a, b) => a - b);
  for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] > 0) pitches.push(ys[i] - ys[i - 1]);
  const pitch = median(pitches) || 20;
  const slack = pitch * 1.5;

  const minSupport = Math.max(3, Math.round(lines.length * 0.08));
  if (gaps.length > MAX_GAPS) return null;
  const found = findGutters(gaps, pageWidth, minSupport, slack);
  // Match tolerance between a line's gap and a gutter's fitted edge.
  const margin = Math.max(pageWidth * 0.02, medianGap * 2);

  // A real gutter is empty space: few rows in its band have a word running
  // across it. Wide gaps in justified prose can line up by chance, and that
  // false gutter runs through the middle of a paragraph, crossed on most rows.
  const crossedShare = (g: Gutter) => {
    const rows = lines.filter((l) => l.yTop >= g.top && l.yTop <= g.bottom);
    const crossed = rows.filter((l) => {
      const x = g.edgeAt(l.yTop);
      return l.words.some((w) => w.x0 < x - margin && w.x1 > x + margin);
    });
    return rows.length ? crossed.length / rows.length : 1;
  };
  const gutters = found.gutters.filter((g) => crossedShare(g) <= 0.3).sort((a, b) => a.edgeAt(0) - b.edgeAt(0));
  if (gutters.length === 0 && !found.edge) return null;
  // Step numbers often hang left of their column ("1 Put all the…" starts a
  // little before the text below it), so a column may start further left of
  // the fitted edge than right of it. A wide gap is still required.
  const hang = Math.max(margin * 2, pageWidth * 0.04);
  const startsAt = (x: number, edgeX: number) => x >= edgeX - hang && x <= edgeX + margin;
  const columnsTop = gutters.reduce((m, g) => Math.min(m, g.top), Infinity);
  const columnsBottom = gutters.reduce((m, g) => Math.max(m, g.bottom), -Infinity);

  const pieces: { column: number; y: number; text: string }[] = [];
  const above: { y: number; text: string }[] = [];
  const below: { y: number; text: string }[] = [];
  const sliver: { y: number; text: string }[] = [];
  let split = false;
  const edge = found.edge;

  for (const original of lines) {
    let l = original;
    // Lift fragments of the facing page off the start of the line: words left
    // of the edge strip's boundary, ending in a wide gap on it
    if (edge && l.yTop >= edge.top && l.yTop <= edge.bottom) {
      const boundary = edge.edgeAt(l.yTop);
      let cut = l.words.findIndex((w) => w.x0 >= boundary - margin);
      if (cut === -1) cut = l.words.length;
      const gapOk = cut === l.words.length || l.words[cut].x0 - l.words[cut - 1]?.x1 >= minGutter;
      if (cut > 0 && gapOk) {
        sliver.push({ y: l.yTop, text: l.words.slice(0, cut).map((w) => w.text).join(' ') });
        split = true;
        if (cut === l.words.length) continue;
        l = { ...l, words: l.words.slice(cut) };
      }
    }

    // Break the line wherever a word starts on a live gutter after a wide gap
    const live = gutters.filter((g) => l.yTop >= g.top && l.yTop <= g.bottom);
    const runs: Word[][] = [[l.words[0]]];
    for (let i = 1; i < l.words.length; i++) {
      const gapWidth = l.words[i].x0 - l.words[i - 1].x1;
      const onGutter = live.some((g) => startsAt(l.words[i].x0, g.edgeAt(l.yTop)));
      // Columns set tight can touch, and then OCR fuses the words either side
      // ("finely and" -> "finelyng cook…"). Inside a live gutter's band, the
      // first word that starts past the edge begins the next column even
      // without a wide gap.
      const crosses = live.some((g) => {
        const edgeX = g.edgeAt(l.yTop);
        return l.words[i].x0 >= edgeX - margin && l.words[i - 1].x0 < edgeX - margin;
      });
      if ((gapWidth >= minGutter && onGutter) || (gapWidth > 0 && crosses)) runs.push([l.words[i]]);
      else runs[runs.length - 1].push(l.words[i]);
    }
    if (runs.length > 1) split = true;

    const text = (ws: Word[]) => ws.map((w) => w.text).join(' ');
    // Outside the band where gutters were seen:
    // - Above it, a line belongs to the heading block (title, subtitle, intro)
    //   in reading order, unless it sits wholly in a column right of a gutter
    //   (a method that starts higher than the ingredients beside it).
    // - Below it, a line is full-width (footer) only if it crosses a gutter.
    //   One that stays to one side is a column running on past its neighbour,
    //   e.g. the last ingredients under a method that ended higher up.
    if (runs.length === 1) {
      const lineX0 = l.words[0].x0;
      const lineX1 = l.words[l.words.length - 1].x1;
      // Only just above the band: a title further up can also sit right of a
      // gutter's x ("GLAZED PORK AND CIT" / "RUS SALAD") and must stay a heading
      const nearBand = l.yTop >= columnsTop - pitch * 3;
      const inRightColumn = nearBand && gutters.some((g) => lineX0 >= g.edgeAt(l.yTop) - hang);
      const crosses = gutters.some((g) => lineX0 < g.edgeAt(l.yTop) - margin && lineX1 > g.edgeAt(l.yTop) + margin);
      if (l.yTop < columnsTop && !inRightColumn) {
        above.push({ y: l.yTop, text: text(runs[0]) });
        continue;
      }
      if (l.yTop > columnsBottom && crosses) {
        below.push({ y: l.yTop, text: text(runs[0]) });
        continue;
      }
    }
    for (const run of runs) {
      // Column = how many gutters lie left of where this piece starts
      const column = gutters.filter((g) => g.edgeAt(l.yTop) - hang <= run[0].x0).length;
      pieces.push({ column, y: l.yTop, text: text(run) });
    }
  }

  // Without a single split the gutters are not doing anything: keep Tesseract's text
  if (!split) return null;

  const byY = (a: { y: number }, b: { y: number }) => a.y - b.y;
  const columns = [...new Set(pieces.map((p) => p.column))].sort((a, b) => a - b);
  const blocks = [
    above.sort(byY).map((p) => p.text).join('\n'),
    ...columns.map((c) =>
      pieces
        .filter((p) => p.column === c)
        .sort(byY)
        .map((p) => p.text)
        .join('\n'),
    ),
    below.sort(byY).map((p) => p.text).join('\n'),
    // Facing-page fragments last, out of the way of the recipe
    sliver.sort(byY).map((p) => p.text).join('\n'),
  ];
  return blocks.filter(Boolean).join('\n\n');
}
