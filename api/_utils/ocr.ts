// OCR for recipe photos. Transcription is deterministic (no generative model),
// so it can never trip Gemini's RECITATION filter and the extracted text is
// verbatim-faithful to the photo.
//
// The engine is behind a small interface so a cloud OCR (e.g. Google Cloud
// Vision) can replace Tesseract later by adding a class here and switching
// getOcrEngine() — callers never change.

import path from 'node:path';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { createWorker, OEM, type Worker } from 'tesseract.js';

export interface OcrResult {
  text: string;
  /** Mean word confidence, 0-100. Clean print scores 80-95, garbage <50. */
  confidence: number;
}

export interface OcrEngine {
  readonly name: string;
  recognize(image: Buffer): Promise<OcrResult>;
}

const require_ = createRequire(import.meta.url);

// One worker per warm serverless instance — wasm + traineddata init costs
// seconds, so it must survive across invocations.
let workerPromise: Promise<Worker> | null = null;
// Vercel's fluid compute can run concurrent invocations in one instance, but a
// single tesseract worker processes one job at a time — serialize through here.
let queue: Promise<unknown> = Promise.resolve();

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng', OEM.LSTM_ONLY, {
      // eng.traineddata.gz is committed at api/_tessdata and shipped to the
      // function via vercel.json includeFiles; cwd is the project root both
      // locally and on Vercel (/var/task).
      langPath: path.join(process.cwd(), 'api', '_tessdata'),
      gzip: true,
      cacheMethod: 'none', // read langPath directly; no writes on a read-only FS
      // Literal resolve so Vercel's file tracing bundles the worker script
      workerPath: require_.resolve('tesseract.js/src/worker-script/node/index.js'),
    }).then(async (worker) => {
      // Photos stripped of EXIF have no DPI; without this tesseract guesses badly
      await worker.setParameters({ user_defined_dpi: '300' });
      return worker;
    });
    workerPromise.catch(() => {
      workerPromise = null; // failed init must not poison later invocations
    });
  }
  return workerPromise;
}

class TesseractEngine implements OcrEngine {
  readonly name = 'tesseract';

  recognize(image: Buffer): Promise<OcrResult> {
    const run = async (): Promise<OcrResult> => {
      const worker = await getWorker();
      try {
        // Request the block/line/word hierarchy so we can reconstruct reading
        // order — tesseract's flat `text` reads across side-by-side columns.
        const { data } = await worker.recognize(image, {}, { blocks: true, text: true });
        const lines = collectLines(data as unknown as TesseractData);
        const reflowed = reflowColumns(lines);
        return { text: reflowed ?? data.text ?? '', confidence: data.confidence ?? 0 };
      } catch (err) {
        // The worker thread may be wedged — drop it and re-init next call
        workerPromise = null;
        worker.terminate().catch(() => undefined);
        throw err;
      }
    };
    const result = queue.then(run, run);
    queue = result.catch(() => undefined);
    return result;
  }
}

// ─── Column reflow ───────────────────────────────────────────────────────────
// Many recipes lay ingredients and method in side-by-side columns. Tesseract's
// layout analysis often merges the two into single lines ("For the curry / and
// leave them to crackle…"), which glues ingredient text to method text and makes
// the structuring step drop whole ingredients. We rebuild the reading order from
// word bounding boxes: detect the vertical gutter, then read the left column
// fully top-to-bottom before the right. Single-column pages find no gutter and
// pass through unchanged.

interface BBox { x0: number; y0: number; x1: number; y1: number }
interface TWord { text?: string; bbox?: BBox }
interface TLine { text?: string; bbox?: BBox; words?: TWord[] }
interface TPara { lines?: TLine[] }
interface TBlock { paragraphs?: TPara[] }
interface TesseractData { blocks?: TBlock[] | null }

interface Line {
  words: { text: string; x0: number; x1: number }[];
  yTop: number;
  width: number; // rightmost x across the line
}

function collectLines(data: TesseractData): Line[] {
  const lines: Line[] = [];
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const ln of para.lines ?? []) {
        const words = (ln.words ?? [])
          .filter((w) => (w.text ?? '').trim().length > 0 && w.bbox)
          .map((w) => ({ text: (w.text ?? '').trim(), x0: w.bbox!.x0, x1: w.bbox!.x1 }))
          .sort((a, b) => a.x0 - b.x0);
        if (words.length > 0) {
          lines.push({ words, yTop: ln.bbox?.y0 ?? 0, width: words[words.length - 1].x1 });
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

/**
 * Returns text re-threaded into left-then-right column order, or null when the
 * page isn't confidently two-column (so the caller keeps tesseract's own text).
 */
function reflowColumns(lines: Line[]): string | null {
  if (lines.length < 6) return null;

  const pageWidth = Math.max(...lines.map((l) => l.width));
  if (pageWidth <= 0) return null;

  // Typical inter-word gap sets the scale; a real gutter is far wider.
  const wordGaps: number[] = [];
  for (const l of lines) {
    for (let i = 1; i < l.words.length; i++) {
      const g = l.words[i].x0 - l.words[i - 1].x1;
      if (g > 0) wordGaps.push(g);
    }
  }
  const medianGap = median(wordGaps) || 10;
  const minGutter = Math.max(pageWidth * 0.045, medianGap * 3.5);

  // Largest internal gap per line — candidate gutter positions
  const bigGap = new Map<Line, { mid: number; splitIdx: number }>();
  const candidateMids: number[] = [];
  for (const l of lines) {
    let best = { width: 0, mid: 0, splitIdx: -1 };
    for (let i = 1; i < l.words.length; i++) {
      const w = l.words[i].x0 - l.words[i - 1].x1;
      if (w > best.width) best = { width: w, mid: (l.words[i].x0 + l.words[i - 1].x1) / 2, splitIdx: i };
    }
    if (best.width >= minGutter && best.splitIdx > 0) {
      bigGap.set(l, { mid: best.mid, splitIdx: best.splitIdx });
      candidateMids.push(best.mid);
    }
  }

  // Need enough lines with a gutter, clustered at a consistent x
  if (candidateMids.length < Math.max(3, lines.length * 0.15)) return null;
  const gutterX = median(candidateMids);
  const tolerance = pageWidth * 0.06;
  const clustered = candidateMids.filter((m) => Math.abs(m - gutterX) <= tolerance).length;
  if (clustered < Math.max(3, candidateMids.length * 0.6)) return null;

  const left: { y: number; text: string }[] = [];
  const right: { y: number; text: string }[] = [];
  for (const l of lines) {
    const gap = bigGap.get(l);
    const splitHere = gap && Math.abs(gap.mid - gutterX) <= tolerance;
    if (splitHere) {
      const lw = l.words.slice(0, gap!.splitIdx);
      const rw = l.words.slice(gap!.splitIdx);
      if (lw.length) left.push({ y: l.yTop, text: lw.map((w) => w.text).join(' ') });
      if (rw.length) right.push({ y: l.yTop, text: rw.map((w) => w.text).join(' ') });
    } else {
      // No gutter gap in this line. If it spans both sides of the gutter it's a
      // full-width heading/intro row — send it left so it keeps its place in the
      // top-of-page flow rather than polluting the right (method) column.
      // Otherwise it lives in a single column; place it by its center.
      const text = l.words.map((w) => w.text).join(' ');
      const spansGutter = l.words[0].x0 < gutterX && l.width > gutterX;
      const center = (l.words[0].x0 + l.width) / 2;
      (spansGutter || center < gutterX ? left : right).push({ y: l.yTop, text });
    }
  }

  if (left.length === 0 || right.length === 0) return null;
  left.sort((a, b) => a.y - b.y);
  right.sort((a, b) => a.y - b.y);
  return left.map((o) => o.text).join('\n') + '\n\n' + right.map((o) => o.text).join('\n');
}

const tesseractEngine = new TesseractEngine();

export function getOcrEngine(): OcrEngine {
  return tesseractEngine;
}

/**
 * Prepares a photo for OCR: EXIF rotation, upscaling small images toward
 * tesseract's preferred ~300dpi glyph size, grayscale + normalize for uneven
 * lighting, then lossless PNG. No hard threshold — tesseract's internal Otsu
 * binarization copes better with shadows than a global cutoff would.
 */
export async function preprocessForOcr(image: Buffer): Promise<Buffer> {
  const base = sharp(image, { failOn: 'none' }).rotate();
  const meta = await base.metadata();
  const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
  // Small photos double (capped 2800px); large ones cap at 3000px to bound runtime
  const target =
    longest > 0 && longest < 1400 ? Math.min(longest * 2, 2800) : Math.min(longest || 3000, 3000);
  return base
    .resize({ width: target, height: target, fit: 'inside', withoutEnlargement: false })
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer();
}

// Gate thresholds: a real recipe photo comfortably clears all of these; failing
// any one means the photo needs the vision model (handwriting, stylized fonts,
// blur). Tune from the `ocr gate fail` reasons in the Vercel logs.
const MIN_TEXT_CHARS = 150; // title + a few ingredients + a couple of steps
const MIN_CONFIDENCE = 60;
const MIN_ALPHA_RATIO = 0.55; // letters / non-whitespace; garbled OCR is symbol soup
const MIN_LINES = 6;

export function assessOcrQuality(result: OcrResult): { ok: boolean; reason: string } {
  const text = result.text.trim();
  if (text.length < MIN_TEXT_CHARS) {
    return { ok: false, reason: `too-short (${text.length} chars)` };
  }
  if (result.confidence < MIN_CONFIDENCE) {
    return { ok: false, reason: `low-confidence (${Math.round(result.confidence)})` };
  }
  const nonWhitespace = text.replace(/\s/g, '').length;
  const letters = (text.match(/[A-Za-z]/g) ?? []).length;
  const alphaRatio = nonWhitespace > 0 ? letters / nonWhitespace : 0;
  if (alphaRatio < MIN_ALPHA_RATIO) {
    return { ok: false, reason: `garbled (alpha ratio ${alphaRatio.toFixed(2)})` };
  }
  const lineCount = text.split('\n').filter((l) => l.trim().length > 0).length;
  if (lineCount < MIN_LINES) {
    return { ok: false, reason: `too-few-lines (${lineCount})` };
  }
  return { ok: true, reason: '' };
}
