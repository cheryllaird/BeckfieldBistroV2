// Stage timing for api/extract-recipe.ts. Pure and dependency-free so it is
// easy to test. It records how long each stage of one request took, formats a
// single log line from an allow-list of fields, and maps the total to a coarse
// bucket for the aggregate counters in analytics/extractionStats*.
//
// Nothing here ever sees a uid, API key, image, OCR text or model output: only
// stage names, durations, a model name, an attempt count and a cold/warm flag.

type StageName =
  | 'auth'
  | 'profile'
  | 'vision'
  | 'ocrPreprocess'
  | 'ocr'
  | 'ocrGemini'
  | 'local'
  | 'analytics';

export type DurationBucket = 'lt5s' | '5to10s' | '10to20s' | '20to40s' | '40sPlus';

export interface GeminiCallInfo {
  model: string;
  attempts: number;
}

type GeminiStage = 'vision' | 'ocrGemini';

export interface TimingSnapshot {
  kind: 'photo' | 'url';
  method: string;
  totalMs: number;
  stagesMs: Partial<Record<StageName, number>>;
  gemini: Partial<Record<GeminiStage, GeminiCallInfo>>;
  /** Set only when OCR ran: true when the worker had to start up. */
  ocrCold?: boolean;
}

/** Maps a duration to its bucket. 4999 ms is `lt5s`, 5000 ms is `5to10s`. */
export function durationBucket(ms: number): DurationBucket {
  if (ms < 5_000) return 'lt5s';
  if (ms < 10_000) return '5to10s';
  if (ms < 20_000) return '10to20s';
  if (ms < 40_000) return '20to40s';
  return '40sPlus';
}

export interface Timer {
  /** Runs `fn`, adding its duration to `name` (also when it throws). */
  stage<T>(name: StageName, fn: () => Promise<T> | T): Promise<T>;
  gemini(stage: GeminiStage, info: GeminiCallInfo): void;
  ocrCold(cold: boolean): void;
  elapsed(): number;
  snapshot(kind: 'photo' | 'url', method: string): TimingSnapshot;
}

export function createTimer(now: () => number = Date.now): Timer {
  const start = now();
  const stagesMs: Partial<Record<StageName, number>> = {};
  const gemini: Partial<Record<GeminiStage, GeminiCallInfo>> = {};
  let ocrColdFlag: boolean | undefined;
  return {
    async stage(name, fn) {
      const t0 = now();
      try {
        return await fn();
      } finally {
        stagesMs[name] = (stagesMs[name] ?? 0) + (now() - t0);
      }
    },
    gemini(stage, info) {
      gemini[stage] = info;
    },
    ocrCold(cold) {
      ocrColdFlag = cold;
    },
    elapsed: () => now() - start,
    snapshot(kind, method) {
      return { kind, method, totalMs: now() - start, stagesMs: { ...stagesMs }, gemini: { ...gemini }, ocrCold: ocrColdFlag };
    },
  };
}

const STAGE_ORDER: StageName[] = ['auth', 'profile', 'vision', 'ocrPreprocess', 'ocr', 'ocrGemini', 'local', 'analytics'];
const MODEL_RE = /^[a-z0-9.-]{1,60}$/i;

/**
 * The one log line per request. Built field by field from an allow-list, so
 * nothing else can end up in it.
 */
export function formatTimingLine(s: TimingSnapshot): string {
  const parts = [`kind=${s.kind}`, `method=${s.method}`, `total=${Math.round(s.totalMs)}ms`];
  for (const name of STAGE_ORDER) {
    const ms = s.stagesMs[name];
    if (ms === undefined) continue;
    parts.push(`${name}=${Math.round(ms)}ms`);
    if (name === 'ocr' && s.ocrCold !== undefined) parts.push(`ocrWorker=${s.ocrCold ? 'cold' : 'warm'}`);
    if (name === 'vision' || name === 'ocrGemini') {
      const g = s.gemini[name];
      if (g && MODEL_RE.test(g.model)) parts.push(`${name}Model=${g.model}`, `${name}Attempts=${Math.max(0, Math.floor(g.attempts))}`);
    }
  }
  return `extract-recipe: timing ${parts.join(' ')}`;
}
