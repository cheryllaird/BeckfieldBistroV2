import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stand-in for the tesseract worker: each test sets the page data it returns.
const { recognize, setParameters } = vi.hoisted(() => ({ recognize: vi.fn(), setParameters: vi.fn() }));
vi.mock('tesseract.js', () => ({
  OEM: { LSTM_ONLY: 1 },
  PSM: { SINGLE_BLOCK: '6', SINGLE_CHAR: '10' },
  createWorker: async () => ({
    setParameters,
    recognize,
    terminate: async () => undefined,
  }),
}));

import sharp from 'sharp';
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
  beforeEach(() => {
    recognize.mockReset();
    setParameters.mockReset();
    setParameters.mockResolvedValue(undefined);
  });

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

  // A page whose first line starts with a misread fraction ("1%"), so the
  // fraction pass runs
  function fractionPage() {
    const words = [word('1%', 10, 45, 40), word('tsp', 55, 90, 40), word('salt', 100, 140, 40)];
    const lines = [{ text: '1% tsp salt', bbox: { x0: 10, x1: 140, y0: 40, y1: 60 }, words }];
    return { text: 'Soup\n1% tsp salt', confidence: 90, blocks: [{ paragraphs: [{ lines }] }] };
  }

  it('keeps the page read when fraction recovery fails', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    recognize.mockResolvedValue({ data: fractionPage() });
    // Not a decodable image, so the fraction pass throws while cropping
    const result = await getOcrEngine().recognize(Buffer.from('img'));
    expect(result.text).toBe('Soup\n1% tsp salt');
    expect(result.fractionsRecovered).toBe(0);
    expect(errors).toHaveBeenCalledWith('fraction recovery failed:', expect.any(String));
    errors.mockRestore();
  });

  it('fails the call when the worker settings cannot be restored, so the worker is dropped', async () => {
    const image = await sharp({ create: { width: 300, height: 120, channels: 3, background: '#ffffff' } }).png().toBuffer();
    recognize.mockResolvedValueOnce({ data: fractionPage() }).mockResolvedValue({ data: { text: '' } });
    setParameters.mockImplementation(async (params: Record<string, string>) => {
      if (params.tessedit_pageseg_mode === '6') throw new Error('worker gone');
    });
    await expect(getOcrEngine().recognize(image)).rejects.toThrow('worker gone');
  });
});
