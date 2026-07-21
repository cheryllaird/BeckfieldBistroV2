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
        const { data } = await worker.recognize(image);
        return { text: data.text ?? '', confidence: data.confidence ?? 0 };
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
