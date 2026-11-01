import { describe, expect, it } from 'vitest';
import { createTimer, durationBucket, formatTimingLine } from './extractionTiming';

describe('durationBucket', () => {
  it('uses the boundaries from the issue', () => {
    expect(durationBucket(0)).toBe('lt5s');
    expect(durationBucket(4999)).toBe('lt5s');
    expect(durationBucket(5000)).toBe('5to10s');
    expect(durationBucket(9999)).toBe('5to10s');
    expect(durationBucket(10_000)).toBe('10to20s');
    expect(durationBucket(20_000)).toBe('20to40s');
    expect(durationBucket(39_999)).toBe('20to40s');
    expect(durationBucket(40_000)).toBe('40sPlus');
  });
});

describe('createTimer', () => {
  it('times stages, adds up repeated ones and keeps timing when a stage throws', async () => {
    let t = 1000;
    const timer = createTimer(() => t);
    await timer.stage('vision', () => { t += 300; });
    await timer.stage('vision', () => { t += 200; });
    await expect(timer.stage('ocr', () => { t += 50; throw new Error('boom'); })).rejects.toThrow('boom');
    t += 10;
    const snap = timer.snapshot('photo', 'ocr+local');
    expect(snap.stagesMs).toEqual({ vision: 500, ocr: 50 });
    expect(snap.totalMs).toBe(560);
    expect(timer.elapsed()).toBe(560);
  });
});

describe('formatTimingLine', () => {
  it('lists the stages that ran, the model, attempts and the OCR worker flag', () => {
    const line = formatTimingLine({
      kind: 'photo',
      method: 'ocr+gemini',
      totalMs: 12_345.6,
      stagesMs: { auth: 20, profile: 30, vision: 8000, ocr: 3000, ocrGemini: 900, analytics: 40 },
      gemini: { vision: { model: 'gemini-3.1-flash-lite', attempts: 3 }, ocrGemini: { model: 'gemini-3.5-flash', attempts: 4 } },
      ocrCold: true,
    });
    expect(line).toBe(
      'extract-recipe: timing kind=photo method=ocr+gemini total=12346ms auth=20ms profile=30ms ' +
        'vision=8000ms visionModel=gemini-3.1-flash-lite visionAttempts=3 ocr=3000ms ocrWorker=cold ' +
        'ocrGemini=900ms ocrGeminiModel=gemini-3.5-flash ocrGeminiAttempts=4 analytics=40ms',
    );
  });

  it('only emits allow-listed fields, so a hostile model name cannot add content', () => {
    const line = formatTimingLine({
      kind: 'photo',
      method: 'failed',
      totalMs: 10,
      stagesMs: { vision: 5 },
      gemini: { vision: { model: 'x uid=abc123 secret', attempts: 1 } },
    });
    expect(line).toBe('extract-recipe: timing kind=photo method=failed total=10ms vision=5ms');
  });
});
