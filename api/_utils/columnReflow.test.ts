import { describe, expect, it } from 'vitest';
import { collectLines, reflowColumns, type Line } from './columnReflow';

// Builds an OCR line from text segments placed at x positions. Words are laid
// out left to right inside each segment at a fixed character width.
const CHAR = 10;
const SPACE = 12;
function line(y: number, ...segments: [x: number, text: string][]): Line {
  const words = segments.flatMap(([x, text]) => {
    let cursor = x;
    return text.split(' ').map((w) => {
      const word = { text: w, x0: cursor, x1: cursor + w.length * CHAR };
      cursor = word.x1 + SPACE;
      return word;
    });
  });
  return { words, yTop: y, yBottom: y + 20 };
}

const page = (...lines: Line[]) => lines;
const LEFT = 50;
const MID = 600;
const RIGHT = 1150;

describe('reflowColumns', () => {
  it('leaves a single-column page alone', () => {
    const lines = Array.from({ length: 10 }, (_, i) => line(100 + i * 30, [LEFT, `This is line ${i} of a plain single column of method text`]));

    expect(reflowColumns(lines)).toBeNull();
  });

  it('reads two fused columns left first, then right', () => {
    const lines = page(
      line(40, [LEFT, 'BEAN STEW']),
      line(100, [LEFT, '2 tbsp olive oil'], [MID, 'Heat the oil in a large pan and add the']),
      line(130, [LEFT, '1 onion, diced'], [MID, 'onion. Fry until soft and golden.']),
      line(160, [LEFT, '400g tin beans'], [MID, 'Add the beans and the stock, then']),
      line(190, [LEFT, '500ml stock'], [MID, 'simmer for twenty minutes.']),
      line(220, [LEFT, '1 tsp salt'], [MID, 'Season and serve.']),
    );

    expect(reflowColumns(page(...lines))?.split('\n')).toEqual([
      'BEAN STEW',
      '',
      '2 tbsp olive oil',
      '1 onion, diced',
      '400g tin beans',
      '500ml stock',
      '1 tsp salt',
      '',
      'Heat the oil in a large pan and add the',
      'onion. Fry until soft and golden.',
      'Add the beans and the stock, then',
      'simmer for twenty minutes.',
      'Season and serve.',
    ]);
  });

  it('handles three columns', () => {
    const lines = Array.from({ length: 6 }, (_, i) =>
      line(100 + i * 30, [LEFT, `ingredient ${i}`], [MID, `method line ${i} goes here`], [RIGHT, `tip line ${i} here`]),
    );

    const text = reflowColumns(lines)!;
    const order = ['ingredient 0', 'ingredient 5', 'method line 0', 'method line 5', 'tip line 0', 'tip line 5'];
    expect(order.map((t) => text.indexOf(t))).toEqual([...order.map((t) => text.indexOf(t))].sort((a, b) => a - b));
    expect(text).not.toMatch(/ingredient \d method/);
  });

  it('keeps a column running on below its neighbour in that column', () => {
    const lines = page(
      line(100, [LEFT, '2 tbsp olive oil'], [MID, 'Heat the oil in a large pan.']),
      line(130, [LEFT, '1 onion, diced'], [MID, 'Fry the onion until soft.']),
      line(160, [LEFT, '400g tin beans'], [MID, 'Add the beans and simmer.']),
      line(190, [LEFT, '500ml stock'], [MID, 'Season and serve hot.']),
      line(220, [LEFT, '1 tsp salt']),
      line(250, [LEFT, '1 tsp pepper']),
    );

    const text = reflowColumns(lines)!;
    expect(text.indexOf('1 tsp pepper')).toBeLessThan(text.indexOf('Heat the oil'));
  });

  it('keeps a full-width title and intro above the columns, in order', () => {
    const lines = page(
      line(20, [LEFT, 'ROASTED SQUASH']),
      line(50, [LEFT, 'with sage butter']),
      line(80, [LEFT, 'A warming autumn supper that comes together in one tray and feeds four people easily.']),
      ...Array.from({ length: 6 }, (_, i) => line(130 + i * 30, [LEFT, `ingredient ${i}`], [MID, `method line ${i} goes here`])),
    );

    expect(reflowColumns(lines)!.split('\n').slice(0, 3)).toEqual([
      'ROASTED SQUASH',
      'with sage butter',
      'A warming autumn supper that comes together in one tray and feeds four people easily.',
    ]);
  });

  it('splits touching columns where OCR left no wide gap', () => {
    const lines = page(
      ...Array.from({ length: 5 }, (_, i) => line(100 + i * 30, [LEFT, `ingredient ${i}`], [MID, `method line ${i} here`])),
      // The ingredient runs right up to the method column on this row
      line(250, [LEFT, '1 green chilli, very finely'], [LEFT + 27 * CHAR + SPACE, 'and'], [MID, 'cook for a minute']),
    );

    const text = reflowColumns(lines)!;
    expect(text).toContain('cook for a minute');
    expect(text).not.toContain('finely and cook');
  });

  it('does not treat wide gaps after bullet glyphs as a gutter', () => {
    const lines = Array.from({ length: 8 }, (_, i) => line(100 + i * 30, [LEFT, '#'], [LEFT + 80, `${i + 1} tbsp ingredient number ${i}`]));

    expect(reflowColumns(lines)).toBeNull();
  });

  it('moves fragments of the facing page at the left edge out of the recipe', () => {
    const fragments = ['bay', 'slices', 'ver', 'ier', 'eft', 'iling', 'tray', 'oss'];
    const lines = fragments.map((f, i) =>
      line(100 + i * 30, [0, f], [150, `${i + 1} tbsp ingredient ${i}`], [MID, `Method line ${i} of the recipe text`]),
    );

    const text = reflowColumns(lines)!;
    expect(text.split('\n')[0]).toBe('1 tbsp ingredient 0');
    expect(text.trim().split('\n').slice(-fragments.length)).toEqual(fragments);
    expect(text).not.toMatch(/\b(?:bay|ier|tray) \d tbsp/);
  });

  it('ignores gaps that line up by chance far apart on the page', () => {
    // A two-column band at the top, then a long single-column method below in
    // which three widely spaced rows happen to have a wide gap at the same x.
    const top = Array.from({ length: 6 }, (_, i) => line(100 + i * 30, [LEFT, `ingredient ${i}`], [MID, `method line ${i} here`]));
    const method = Array.from({ length: 30 }, (_, i) =>
      i % 12 === 0
        ? line(400 + i * 30, [LEFT, 'Stir well and'], [900, 'leave to cool completely.'])
        : line(400 + i * 30, [LEFT, `Prose line ${i} of the method continues across the whole width.`]),
    );

    const text = reflowColumns([...top, ...method])!;
    expect(text).toContain('Stir well and leave to cool completely.');
  });
});

describe('reflowColumns on crafted input', () => {
  it('stays fast on a dense grid of short words with wide gaps', () => {
    // 300 lines × 15 word pairs with wide gaps: thousands of gutter candidates
    const lines = Array.from({ length: 300 }, (_, r) =>
      line(r * 25, ...Array.from({ length: 15 }, (_, c): [number, string] => [c * 90 + (r % 7) * 3, 'ab cd'])),
    );
    const start = performance.now();
    reflowColumns(lines);
    expect(performance.now() - start).toBeLessThan(1500);
  });

  it('declines pages far bigger than any recipe', () => {
    const lines = Array.from({ length: 2000 }, (_, r) => line(r * 25, [LEFT, 'ingredient'], [MID, 'method text']));
    expect(reflowColumns(lines)).toBeNull();
  });
});

describe('collectLines', () => {
  it('flattens tesseract blocks into lines of words sorted by x', () => {
    const lines = collectLines({
      blocks: [
        {
          paragraphs: [
            {
              lines: [
                {
                  bbox: { x0: 0, y0: 10, x1: 100, y1: 30 },
                  words: [
                    { text: 'world', bbox: { x0: 60, y0: 10, x1: 100, y1: 30 } },
                    { text: 'hello', bbox: { x0: 0, y0: 10, x1: 50, y1: 30 } },
                    { text: '  ', bbox: { x0: 55, y0: 10, x1: 58, y1: 30 } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(lines).toEqual([
      { words: [{ text: 'hello', x0: 0, x1: 50 }, { text: 'world', x0: 60, x1: 100 }], yTop: 10, yBottom: 30 },
    ]);
  });

  it('copes with missing blocks', () => {
    expect(collectLines({ blocks: null })).toEqual([]);
  });
});
