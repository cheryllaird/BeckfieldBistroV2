import { describe, expect, it } from 'vitest';
import { cleanLine, continuesIngredient, isMagazineStep, isNoiseLine, isNutritionLine, splitAtBullets } from './ocrLines';

describe('cleanLine', () => {
  it.each([
    ['# 1 red onion, diced', '1 red onion, diced'],
    ['@ 2 tbsp olive oil', '2 tbsp olive oil'],
    ['© juice of 1 lemon', 'juice of 1 lemon'],
    ['#1 x 400g tin tomatoes', '1 x 400g tin tomatoes'],
  ])('strips the bullet from %j and flags it', (raw, text) => {
    expect(cleanLine(raw)).toEqual({ text, bulleted: true });
  });

  it('strips edge noise without calling it a bullet', () => {
    expect(cleanLine('| 2 tsp salt |')).toEqual({ text: '2 tsp salt', bulleted: false });
  });

  it('fixes unit misreads only right after an amount', () => {
    expect(cleanLine('3 thsp butter').text).toBe('3 tbsp butter');
    expect(cleanLine('1tbsp oil').text).toBe('1 tbsp oil');
    expect(cleanLine('Stir in the thsp').text).toBe('Stir in the thsp');
  });

  it('drops a stray step number from the column beside an ingredient', () => {
    expect(cleanLine('2 tbsp lemon juice 2').text).toBe('2 tbsp lemon juice');
    expect(cleanLine('Serves 4').text).toBe('Serves 4');
  });
});

describe('splitAtBullets', () => {
  it('splits two ingredient columns read as one line', () => {
    expect(splitAtBullets('# 2 tbsp olive oil # 1x 400g tin beans')).toEqual(['# 2 tbsp olive oil', '# 1x 400g tin beans']);
  });

  it('leaves "&" and lines without a mid-line bullet alone', () => {
    expect(splitAtBullets('salt & pepper')).toEqual(['salt & pepper']);
    expect(splitAtBullets('2 tbsp olive oil')).toEqual(['2 tbsp olive oil']);
  });
});

describe('isNoiseLine', () => {
  it.each(['175', 'Ray - ==', '3 - - ’', 'h h 4 Fla', '3g852gs358382s823z3: ZS x MW', '|'])('treats %j as noise', (line) => {
    expect(isNoiseLine(line)).toBe(true);
  });

  it.each(['1 red onion', 'Salt', 'Heat the oil in a pan.', 'For the salad'])('keeps %j', (line) => {
    expect(isNoiseLine(line)).toBe(false);
  });
});

describe('isNutritionLine', () => {
  it.each(['357cals; 7g fat (1g sat fat);', '27g protein; 9g fibre, 41g carbs;', '13g total sugars; 0.4g salt', 'PER SERVING', 'HANDS-ON TIME 25 mins'])(
    'recognises %j',
    (line) => {
      expect(isNutritionLine(line)).toBe(true);
    },
  );

  it.each(['100g fat-free yogurt', '2 tsp salt', '1 tbsp caster sugar'])('leaves the ingredient %j alone', (line) => {
    expect(isNutritionLine(line)).toBe(false);
  });
});

describe('isMagazineStep', () => {
  it('recognises a long numbered step without a full stop after the number', () => {
    expect(isMagazineStep('2 Add the red pepper and cook for 5 minutes, then')).toBe(true);
  });

  it('does not take a short capitalised ingredient for a step', () => {
    expect(isMagazineStep('2 Indian bay leaves (cassia')).toBe(false);
    expect(isMagazineStep('2 tbsp oil and a long description of the oil here')).toBe(false);
  });
});

describe('continuesIngredient', () => {
  const prev = { text: '1 cucumber, halved', bulleted: true };

  it('joins a lower-case line in a bulleted list', () => {
    expect(continuesIngredient(prev, { text: 'lengthways and deseeded', bulleted: false }, true)).toBe(true);
  });

  it('joins a bracketed line', () => {
    expect(continuesIngredient({ text: '100g coriander', bulleted: false }, { text: '(stalks and leaves)', bulleted: false }, false)).toBe(true);
  });

  it('keeps a lower-case ingredient of its own in an unbulleted list', () => {
    expect(continuesIngredient({ text: '2 eggs', bulleted: false }, { text: 'salt and pepper', bulleted: false }, false)).toBe(false);
  });

  it('never joins the next bulleted item', () => {
    expect(continuesIngredient(prev, { text: 'mint leaves', bulleted: true }, true)).toBe(false);
  });
});

describe('ReDoS guard', () => {
  it('handles long adversarial lines quickly', () => {
    const hostile = ['#'.repeat(10_000), '- '.repeat(5_000), `1${' '.repeat(10_000)}x`, 'a '.repeat(5_000) + '!'];
    const start = performance.now();
    for (const line of hostile) {
      splitAtBullets(line).map(cleanLine).forEach((l) => {
        isNoiseLine(l.text);
        isNutritionLine(l.text);
        isMagazineStep(l.text);
      });
    }
    expect(performance.now() - start).toBeLessThan(50);
  });
});
