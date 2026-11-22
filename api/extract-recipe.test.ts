import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const getUser = vi.fn();
const setDoc = vi.fn();
const generateContent = vi.fn();
const recognize = vi.fn();

vi.mock('./_utils/auth.js', () => ({ getUser: (req: VercelRequest) => getUser(req) }));
vi.mock('./_utils/crypto.js', () => ({ decryptSecret: () => 'plain-key' }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (name: string) => ({
      doc: (id: string) =>
        name === 'analytics'
          ? { set: (data: unknown, opts: unknown) => setDoc(id, data, opts) }
          : { collection: () => ({ doc: () => ({ get: async () => ({ data: () => ({ geminiApiKeyEncrypted: { c: 1 } }) }) }) }) },
    }),
  }),
  FieldValue: { increment: (n: number) => ({ inc: n }), serverTimestamp: () => 'TS' },
}));
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent };
    }
  },
}));
vi.mock('./_utils/ocr.js', () => ({
  getOcrEngine: () => ({ recognize }),
  preprocessForOcr: async (b: Buffer) => b,
  assessOcrQuality: () => ({ ok: true, reason: 'ok' }),
}));

const safeFetchText = vi.fn();
vi.mock('./_utils/safeFetch.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./_utils/safeFetch')>()),
  safeFetchText: (...args: unknown[]) => safeFetchText(...args),
}));

import handler from './extract-recipe';
import { UnsafeUrlError } from './_utils/safeFetch';
import { BAD_URL_MESSAGE, BLOCKED_SITE_MESSAGE } from './_utils/fetchErrors';

function makeRes() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

const geminiText = (text: string) => ({ response: { text: () => text } });
const RECIPE_JSON = JSON.stringify({ title: 'Soup', servings: 2, ingredientSections: [], steps: ['Boil'] });

function call(extra: Record<string, unknown> = {}) {
  const res = makeRes();
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer good' },
    body: { base64: 'aGVsbG8=', mediaType: 'image/jpeg', ...extra },
  } as unknown as VercelRequest;
  return handler(req, res as unknown as VercelResponse).then(() => res);
}

const timingLines = (spy: ReturnType<typeof vi.spyOn>) =>
  spy.mock.calls.map((c: unknown[]) => String(c[0])).filter((l: string) => l.startsWith('extract-recipe: timing'));

describe('extract-recipe photo path', () => {
  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ uid: 'secret-uid-1', email: '', name: 'x' });
    setDoc.mockReset().mockResolvedValue(undefined);
    generateContent.mockReset();
    recognize.mockReset();
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('vision success logs one timing line and increments one duration bucket', async () => {
    generateContent.mockResolvedValue(geminiText(RECIPE_JSON));
    const res = await call();

    expect(res.status).toHaveBeenCalledWith(200);
    const lines = timingLines(log);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/method=gemini-vision total=\d+ms auth=\d+ms profile=\d+ms vision=\d+ms visionModel=gemini-3\.1-flash-lite visionAttempts=1 analytics=\d+ms$/);
    expect(lines[0]).not.toContain('secret-uid-1');
    expect(lines[0]).not.toContain('plain-key');

    const [, lifetime] = setDoc.mock.calls[0];
    expect(lifetime.durations).toEqual({ 'gemini-vision': { lt5s: { inc: 1 } } });
    expect(lifetime.ocrCold).toBeUndefined();
    expect(setDoc).toHaveBeenCalledTimes(2); // lifetime + daily, no extra round trip
  });

  it('vision RECITATION goes to ocr+local with no second Gemini call (ADR 0010)', async () => {
    generateContent.mockRejectedValue(new Error('Candidate was blocked due to RECITATION'));
    recognize.mockResolvedValue({ text: 'Soup\nIngredients\n1 onion\nMethod\n1. Boil', confidence: 90, columnsReflowed: false, coldWorker: true });
    const res = await call();

    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].extractionMethod).toBe('ocr+local');
    const lines = timingLines(log);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/method=ocr\+local .* ocr=\d+ms ocrWorker=cold local=\d+ms/);
    const [, lifetime] = setDoc.mock.calls[0];
    expect(lifetime.ocrCold).toEqual({ inc: 1 });
    expect(lifetime.fallbackReasons).toEqual({ 'vision-recitation': { inc: 1 } });
  });

  it('still returns the recipe when the analytics write fails', async () => {
    generateContent.mockResolvedValue(geminiText(RECIPE_JSON));
    setDoc.mockRejectedValue(new Error('firestore down'));
    const res = await call();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].title).toBe('Soup');
    expect(timingLines(log)).toHaveLength(1);
  });
});

function callUrl(url = 'https://recipes.example.com/soup') {
  const res = makeRes();
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer good' },
    body: { url },
  } as unknown as VercelRequest;
  return handler(req, res as unknown as VercelResponse).then(() => res);
}

const page = (html: string, status = 200, contentType = 'text/html; charset=utf-8') => ({
  status,
  contentType,
  text: html,
  url: 'https://recipes.example.com/soup',
});

const abortError = () =>
  Object.assign(new Error('The operation was aborted'), { name: 'AbortError', code: 'ABORT_ERR' });

describe('extract-recipe URL path', () => {
  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ uid: 'secret-uid-1', email: '', name: 'x' });
    setDoc.mockReset().mockResolvedValue(undefined);
    generateContent.mockReset();
    safeFetchText.mockReset();
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  const lifetimeStats = () => setDoc.mock.calls[0][1];

  it('a site that never answers (timeout) gets the blocked-site message and is counted', async () => {
    safeFetchText.mockRejectedValue(abortError());
    const res = await callUrl();

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({ error: BLOCKED_SITE_MESSAGE });
    expect(lifetimeStats().counts).toEqual({ failed: { inc: 1 } });
    expect(lifetimeStats().fallbackReasons).toEqual({ 'urlFetch-timeout': { inc: 1 } });
    expect(timingLines(log)).toHaveLength(1);
    expect(timingLines(log)[0]).toMatch(/kind=url method=failed/);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('a dropped connection gets the blocked-site message', async () => {
    safeFetchText.mockRejectedValue(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }));
    const res = await callUrl();

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({ error: BLOCKED_SITE_MESSAGE });
    expect(lifetimeStats().fallbackReasons).toEqual({ 'urlFetch-refused': { inc: 1 } });
  });

  it.each([401, 403, 429, 451, 503])('HTTP %i gets the blocked-site message', async (status) => {
    safeFetchText.mockResolvedValue(page('', status));
    const res = await callUrl();

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({ error: BLOCKED_SITE_MESSAGE });
    expect(lifetimeStats().fallbackReasons).toEqual({ [`urlFetch-http${status}`]: { inc: 1 } });
  });

  it.each([404, 410])('HTTP %i keeps "check the URL"', async (status) => {
    safeFetchText.mockResolvedValue(page('', status));
    const res = await callUrl();

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: BAD_URL_MESSAGE });
    expect(lifetimeStats().fallbackReasons).toEqual({ [`urlFetch-http${status}`]: { inc: 1 } });
  });

  it('a blocked or invalid address keeps "check the URL"', async () => {
    safeFetchText.mockRejectedValue(new UnsafeUrlError('That address is not allowed'));
    const res = await callUrl('http://127.0.0.1/');

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: BAD_URL_MESSAGE });
    expect(lifetimeStats().fallbackReasons).toEqual({ 'urlFetch-bad-url': { inc: 1 } });
  });

  it('a non-HTML response is counted as a failure', async () => {
    safeFetchText.mockResolvedValue(page('%PDF', 200, 'application/pdf'));
    const res = await callUrl();

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'URL does not point to an HTML page' });
    expect(lifetimeStats().fallbackReasons).toEqual({ 'urlFetch-not-html': { inc: 1 } });
  });

  it('a RECITATION block never suggests another route to the same content (ADR 0010)', async () => {
    safeFetchText.mockResolvedValue(page('<html><body><p>Soup. 1 onion. Boil.</p></body></html>'));
    generateContent.mockRejectedValue(new Error('Candidate was blocked due to RECITATION'));
    const res = await callUrl();

    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(422);
    const { error } = res.json.mock.calls[0][0] as { error: string };
    expect(error).not.toMatch(/photo|screenshot|paste/i);
    expect(lifetimeStats().fallbackReasons).toEqual({ 'urlGemini-recitation': { inc: 1 } });
  });
});
