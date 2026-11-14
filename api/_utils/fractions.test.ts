import { describe, expect, it } from 'vitest';
import { findFractionCandidates, quarterBox, resolveFraction, typicalDigitWidth, type CandidateWord } from './fractions';

// Words laid out left to right, 12px per character, 10px apart
function words(...texts: string[]): CandidateWord[] {
  let x = 100;
  return texts.map((text) => {
    const w: CandidateWord = { text, bbox: { x0: x, y0: 500, x1: x + text.length * 12, y1: 520 } };
    w.symbols = [...text].map((ch, i) => ({ text: ch, bbox: { x0: x + i * 12, y0: 500, x1: x + (i + 1) * 12, y1: 520 } }));
    x = w.bbox.x1 + 10;
    return w;
  });
}

describe('findFractionCandidates', () => {
  it.each([['1%'], ['%'], ['¥'], ['V4'], ['Ya']])('flags the misread token %j at the start of a line', (token) => {
    expect(findFractionCandidates(words(token, 'tsp', 'salt'), 12).map((c) => c.index)).toEqual([0]);
  });

  it('flags a token after bullet glyphs', () => {
    expect(findFractionCandidates(words('#', 'V4', 'tsp', 'cumin'), 12).map((c) => c.index)).toEqual([1]);
  });

  it('flags a token after "of"', () => {
    expect(findFractionCandidates(words('juice', 'of', '¥', 'lime'), 12).map((c) => c.index)).toEqual([2]);
  });

  it('flags a lone digit too wide to be a digit', () => {
    const line = words('5', 'tsp', 'salt');
    line[0].bbox.x1 = line[0].bbox.x0 + 20;
    expect(findFractionCandidates(line, 12)).toHaveLength(1);
  });

  it('leaves ordinary amounts and prose alone', () => {
    expect(findFractionCandidates(words('2', 'tsp', 'salt'), 12)).toEqual([]);
    expect(findFractionCandidates(words('100g', 'flour'), 12)).toEqual([]);
    expect(findFractionCandidates(words('Heat', 'the', 'oil'), 12)).toEqual([]);
    expect(findFractionCandidates(words('salt', 'and', '1%'), 12)).toEqual([]);
  });

  it('ignores a token followed by a bullet glyph (edge noise before a bulleted line)', () => {
    expect(findFractionCandidates(words('¥', '&', '1', 'onion'), 12)).toEqual([]);
  });

  it('places the glyph region after the whole-number digit', () => {
    const [candidate] = findFractionCandidates(words('1%', 'tsp'), 12);
    expect(candidate.lead).toBe('1');
    expect(candidate.region.left).toBe(113); // after the "1" symbol, before "tsp"
  });
});

describe('resolveFraction', () => {
  it('uses a fraction read from the image', () => {
    expect(resolveFraction('1%', '1', '1', '2')).toBe('1½');
    expect(resolveFraction('1%', '1', '1', '4')).toBe('1¼');
    expect(resolveFraction('5', '', '1', '3')).toBe('⅓');
    expect(resolveFraction('2', '', '3', '4')).toBe('¾');
  });

  it('takes ½ from a denominator of 2 alone', () => {
    expect(resolveFraction('¥', '', '', '2')).toBe('½');
  });

  it('falls back on an unambiguous misread when the image is silent', () => {
    expect(resolveFraction('V4', '', '', '')).toBe('¼');
    expect(resolveFraction('Ya', '', '', '')).toBe('½');
    expect(resolveFraction('V4', '', '', '4')).toBe('¼');
  });

  it('refuses when the evidence is missing, impossible or contradictory', () => {
    expect(resolveFraction('1%', '1', '', '')).toBeNull(); // "%" is ½ or ¼
    expect(resolveFraction('1%', '1', '1', '7')).toBeNull(); // not a kitchen fraction
    expect(resolveFraction('5', '', '', '3')).toBeNull(); // ⅓ or ⅔
    expect(resolveFraction('V4', '', '', '2')).toBeNull(); // hint says ¼, image says /2
    expect(resolveFraction('V4', '', '1', '2')).toBeNull();
    expect(resolveFraction('1', '', '', '1')).toBeNull();
  });
});

describe('typicalDigitWidth', () => {
  it('takes the median per-digit width of plain numbers', () => {
    expect(typicalDigitWidth(words('2', 'tbsp', '400', 'x', '15'))).toBe(12);
  });

  it('defaults when the page has no numbers', () => {
    expect(typicalDigitWidth(words('salt', 'and', 'pepper'))).toBe(12);
  });
});

describe('quarterBox', () => {
  it.each([75, 125, 19, 8, 9, 1000])('stays inside a %ipx glyph for both quarters', (n) => {
    for (const [l, t] of [[0, 0], [0.42, 0.42]]) {
      const box = quarterBox({ width: n, height: n }, l, t);
      expect(box.left + box.width).toBeLessThanOrEqual(n);
      expect(box.top + box.height).toBeLessThanOrEqual(n);
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
    }
  });

  it('would have overshot at 75px with independent rounding', () => {
    // The bug it guards: round(0.42 × 75) + round(0.58 × 75) = 32 + 44 = 76
    expect(Math.round(0.42 * 75) + Math.round(0.58 * 75)).toBe(76);
    expect(quarterBox({ width: 75, height: 75 }, 0.42, 0.42)).toEqual({ left: 32, top: 32, width: 43, height: 43 });
  });
});
