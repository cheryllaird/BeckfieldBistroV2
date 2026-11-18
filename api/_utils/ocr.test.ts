import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stand-in for the tesseract worker: each test sets the page data it returns.
const { recognize } = vi.hoisted(() => ({ recognize: vi.fn() }));
vi.mock('tesseract.js', () => ({
  OEM: { LSTM_ONLY: 1 },
  createWorker: async () => ({
    setParameters: async () => undefined,
    recognize,
    terminate: async () => undefined,
  }),
}));

import { getOcrEngine } from './ocr';

const word = (text: string, x0: number, x1: number, y: number) => ({
  text,
  bbox: { x0, x1, y0: y, y1: y + 20 },
});

// Eight rows of "ingredient | method" with a wide gutter at x≈100-400.
function twoColumnPage() {
  const lines = Array.from({ length: 8 }, (_, i) => {
    const y = i * 30;
    const words = [word('2', 0, 20, y), word('tbsp', 25, 60, y), word(`oil${i}`, 65, 100, y), word('Stir', 400, 450, y), word(`well${i}`, 455, 500, y)];
    return { text: words.map((w) => w.text).join(' '), bbox: { x0: 0, x1: 500, y0: y, y1: y + 20 }, words };
  });
  const text = lines.map((l) => l.text).join('\n');
  return { text, confidence: 91, blocks: [{ paragraphs: [{ lines }] }] };
}

describe('TesseractEngine.recognize', () => {
  beforeEach(() => recognize.mockReset());

  it('returns rawText equal to text when no reflow happens', async () => {
    recognize.mockResolvedValue({ data: { text: 'Soup\n1 onion', confidence: 88, blocks: null } });
    const result = await getOcrEngine().recognize(Buffer.from('img'));
    expect(result.columnsReflowed).toBe(false);
    expect(result.text).toBe('Soup\n1 onion');
    expect(result.rawText).toBe('Soup\n1 onion');
  });

  it('keeps tesseract text as rawText when the columns are reflowed', async () => {
    const page = twoColumnPage();
    recognize.mockResolvedValue({ data: page });
    const result = await getOcrEngine().recognize(Buffer.from('img'));
    expect(result.columnsReflowed).toBe(true);
    expect(result.rawText).toBe(page.text);
    expect(result.text).not.toBe(page.text);
    // Left column first, then the method column
    expect(result.text.split('\n\n')[0]).toBe(Array.from({ length: 8 }, (_, i) => `2 tbsp oil${i}`).join('\n'));
  });
});
