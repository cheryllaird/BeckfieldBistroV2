// OCR for recipe photos. Transcription is deterministic (no generative model),
// so the extracted text is verbatim-faithful to the photo.
//
// The engine is behind a small interface so a cloud OCR (e.g. Google Cloud
// Vision) can replace Tesseract later by adding a class here and switching
// getOcrEngine() — callers never change.

import path from 'node:path';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import { collectLines, reflowColumns, type TesseractData } from './columnReflow.js';
import { findFractionCandidates, resolveFraction, typicalDigitWidth, type CandidateWord } from './fractions.js';

export interface OcrResult {
  /** The text callers use: column-reflowed when side-by-side columns were detected. */
  text: string;
  /** Tesseract's own text, before any column reflow. Kept for offline evaluation. */
  rawText: string;
  /** Mean word confidence, 0-100. Clean print scores 80-95, garbage <50. */
  confidence: number;
  /** True when side-by-side columns were detected and text was re-threaded. */
  columnsReflowed: boolean;
  /** Fraction glyphs re-read from the image and corrected in `text` (not in rawText). */
  fractionsRecovered?: number;
  /** True when this call had to start the OCR worker (cold instance). */
  coldWorker?: boolean;
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
      const coldWorker = !workerPromise;
      const worker = await getWorker();
      try {
        // Request the block/line/word hierarchy so we can reconstruct reading
        // order — tesseract's flat `text` reads across side-by-side columns.
        const { data } = await worker.recognize(image, {}, { blocks: true, text: true });
        const rawText = data.text ?? '';
        const fixed = await recoverFractions(worker, image, data as unknown as FractionPage);
        const lines = collectLines(data as unknown as TesseractData);
        const reflowed = reflowColumns(lines);
        return {
          text: reflowed ?? applyLineFixes(rawText, fixed),
          rawText,
          fractionsRecovered: fixed.length,
          confidence: data.confidence ?? 0,
          columnsReflowed: reflowed !== null,
          coldWorker,
        };
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

// ─── Fraction recovery ───────────────────────────────────────────────────────
// Tesseract misreads fraction glyphs ("1½" → "1%", "⅓" → "5"). For each
// candidate (see fractions.ts) the glyph is cropped, enlarged, and its top-left
// and bottom-right quarters are read as single digits. Words are corrected in
// place, so the column reflow and the fallback text both carry the fix.

interface FractionPage {
  blocks?: { paragraphs?: { lines?: { text?: string; words?: CandidateWord[] }[] }[] }[] | null;
}

/** Line text before and after a fix, to patch Tesseract's flat text too. */
interface LineFix { before: string; after: string }

async function readDigit(worker: Worker, glyph: Buffer, size: { width: number; height: number }, left: number, top: number): Promise<string> {
  const part = await sharp(glyph)
    .extract({
      left: Math.round(size.width * left),
      top: Math.round(size.height * top),
      width: Math.max(2, Math.round(size.width * 0.58)),
      height: Math.max(2, Math.round(size.height * 0.58)),
    })
    .resize({ height: 100 })
    .extend({ top: 40, bottom: 40, left: 40, right: 40, background: '#ffffff' })
    .png()
    .toBuffer();
  const { data } = await worker.recognize(part);
  return (data.text ?? '').trim();
}

async function recoverFractions(worker: Worker, image: Buffer, page: FractionPage): Promise<LineFix[]> {
  const lines = (page.blocks ?? []).flatMap((b) => (b.paragraphs ?? []).flatMap((p) => p.lines ?? []));
  const digitWidth = typicalDigitWidth(lines.flatMap((l) => l.words ?? []));
  const work = lines.flatMap((line) =>
    findFractionCandidates(line.words ?? [], digitWidth).map((candidate) => ({ line, candidate })),
  );
  if (work.length === 0) return [];

  const meta = await sharp(image).metadata();
  const fixes: LineFix[] = [];
  // Single-digit reading for the glyph parts; the page settings are restored
  // before the worker is used for anything else
  await worker.setParameters({ tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: PSM.SINGLE_CHAR });
  try {
    for (const { line, candidate } of work) {
      const words = line.words ?? [];
      const word = words[candidate.index];
      const { left, top } = candidate.region;
      const width = Math.min(candidate.region.width, (meta.width ?? 0) - left);
      const height = Math.min(candidate.region.height, (meta.height ?? 0) - top);
      if (width < 4 || height < 4) continue;
      // Two steps: sharp applies trim before extract within one pipeline
      const crop = await sharp(image).extract({ left, top, width, height }).toBuffer();
      const glyph = await sharp(crop).trim({ threshold: 60 }).toBuffer({ resolveWithObject: true });
      if (glyph.info.width < 8 || glyph.info.height < 8) continue;
      const numerator = await readDigit(worker, glyph.data, glyph.info, 0, 0);
      const denominator = await readDigit(worker, glyph.data, glyph.info, 0.42, 0.42);
      const replacement = resolveFraction(word.text, candidate.lead, numerator, denominator);
      if (!replacement) continue;
      const before = words.map((w) => w.text).join(' ');
      word.text = replacement;
      fixes.push({ before, after: words.map((w) => w.text).join(' ') });
    }
  } finally {
    await worker.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
  }
  return fixes;
}

/** Applies word fixes to Tesseract's flat text, line by line. */
function applyLineFixes(text: string, fixes: LineFix[]): string {
  if (fixes.length === 0) return text;
  return text
    .split('\n')
    .map((line) => {
      const normalised = line.replace(/\s+/g, ' ').trim();
      const fix = fixes.find((f) => f.before === normalised);
      return fix ? fix.after : line;
    })
    .join('\n');
}

const tesseractEngine = new TesseractEngine();

export function getOcrEngine(): OcrEngine {
  return tesseractEngine;
}

/**
 * Optional preprocessing variants, for comparing settings offline
 * (`npm run eval:ocr -- --variant …`). Omitted fields keep the production
 * defaults, so `preprocessForOcr(image)` behaves exactly as before.
 */
export interface PreprocessOptions {
  /** Longest side to resize to. Default: double small photos (cap 2800px), else cap 3000px. */
  targetLongest?: number;
  /** Normalize contrast for uneven lighting. Default true. */
  normalize?: boolean;
  /** Sharpen glyph edges. Default true. */
  sharpen?: boolean;
  /** Hard black/white cutoff (0-255). Default none: tesseract's Otsu copes better with shadows. */
  threshold?: number;
}

/**
 * Prepares a photo for OCR: EXIF rotation, upscaling small images toward
 * tesseract's preferred ~300dpi glyph size, grayscale + normalize for uneven
 * lighting, then lossless PNG. No hard threshold by default — tesseract's
 * internal Otsu binarization copes better with shadows than a global cutoff would.
 */
export async function preprocessForOcr(image: Buffer, options: PreprocessOptions = {}): Promise<Buffer> {
  const base = sharp(image, { failOn: 'none' }).rotate();
  const meta = await base.metadata();
  const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
  // Small photos double (capped 2800px); large ones cap at 3000px to bound runtime
  const target =
    options.targetLongest ??
    (longest > 0 && longest < 1400 ? Math.min(longest * 2, 2800) : Math.min(longest || 3000, 3000));
  let pipeline = base
    .resize({ width: target, height: target, fit: 'inside', withoutEnlargement: false })
    .grayscale();
  if (options.normalize ?? true) pipeline = pipeline.normalize();
  if (options.sharpen ?? true) pipeline = pipeline.sharpen();
  if (options.threshold !== undefined) pipeline = pipeline.threshold(options.threshold);
  return pipeline.png().toBuffer();
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
