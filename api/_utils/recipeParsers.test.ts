import { describe, expect, it } from 'vitest';
import {
  buildIngredientSections,
  flattenInstructions,
  looksLikeSectionHeader,
  parseIngredientLine,
  parseIsoDuration,
  parseRecipeText,
} from './recipeParsers';

describe('parseIsoDuration', () => {
  it.each([
    ['PT1H30M', '1h 30m'],
    ['PT2H', '2h'],
    ['PT45M', '45 mins'],
    ['pt20m', '20 mins'],
    ['PT0M', ''],
    ['', ''],
    [undefined, ''],
  ])('%j → %j', (iso, expected) => {
    expect(parseIsoDuration(iso)).toBe(expected);
  });
});

describe('parseIngredientLine', () => {
  it('splits quantity, unit and name', () => {
    expect(parseIngredientLine('200 g plain flour')).toEqual({
      name: 'plain flour',
      quantity: 200,
      unit: 'g',
      originalText: '200 g plain flour',
    });
  });

  it('strips a literal "of" without eating the start of the name', () => {
    expect(parseIngredientLine('2 cups of flour')).toMatchObject({ name: 'flour', unit: 'cups', quantity: 2 });
    expect(parseIngredientLine('2 tbsp olive oil')).toMatchObject({ name: 'olive oil', unit: 'tbsp' });
  });

  it.each([
    ['1/2 tsp salt', 0.5],
    ['1,5 l stock', 1.5],
    ['0.25 kg butter', 0.25],
  ])('parses the quantity in %j as %d', (line, quantity) => {
    expect(parseIngredientLine(line).quantity).toBeCloseTo(quantity);
  });

  it.each([
    ['½ tsp salt', 0.5],
    ['1½ cups milk', 1.5],
    ['1 ½ cups milk', 1.5],
    ['2¾ cups', 2.75],
    ['⅛ tsp nutmeg', 0.125],
    ['1⁄2 tsp salt', 0.5],
  ])('adds a unicode fraction to any whole number in %j (→ %d)', (line, quantity) => {
    expect(parseIngredientLine(line).quantity).toBeCloseTo(quantity);
  });

  it('parses the unit and name after a bare unicode fraction', () => {
    expect(parseIngredientLine('½ tsp salt')).toMatchObject({ quantity: 0.5, unit: 'tsp', name: 'salt' });
    expect(parseIngredientLine('1 ½ cups milk')).toMatchObject({ unit: 'cups', name: 'milk' });
  });

  it('lowercases the unit', () => {
    expect(parseIngredientLine('3 Tbsp honey').unit).toBe('tbsp');
  });

  it('does not treat the start of a word as a unit', () => {
    expect(parseIngredientLine('2 garlic bulbs')).toMatchObject({ unit: '', name: 'garlic bulbs' });
  });

  it('handles lines with no quantity or unit', () => {
    expect(parseIngredientLine('Salt and pepper')).toEqual({
      name: 'Salt and pepper',
      quantity: 0,
      unit: '',
      originalText: 'Salt and pepper',
    });
  });
});

describe('flattenInstructions', () => {
  it('splits a single Text value into steps instead of iterating characters', () => {
    expect(flattenInstructions('Preheat the oven.\nMix everything.\n\nBake for 20 minutes.')).toEqual([
      'Preheat the oven.',
      'Mix everything.',
      'Bake for 20 minutes.',
    ]);
  });

  it('splits a single Text value on HTML block tags', () => {
    expect(flattenInstructions('<p>Chop.</p><p>Fry.</p>Serve.<br/>Enjoy.')).toEqual([
      'Chop.',
      'Fry.',
      'Serve.',
      'Enjoy.',
    ]);
  });

  it('reads an array of strings and HowToStep objects', () => {
    expect(
      flattenInstructions([
        'Boil water.',
        { '@type': 'HowToStep', text: 'Add pasta.' },
        { '@type': 'HowToStep', name: 'Drain.' },
      ]),
    ).toEqual(['Boil water.', 'Add pasta.', 'Drain.']);
  });

  it('recurses into HowToSection groups', () => {
    expect(
      flattenInstructions([
        { '@type': 'HowToSection', name: 'Sauce', itemListElement: [{ text: 'Melt butter.' }, { text: 'Whisk in flour.' }] },
        { '@type': 'HowToSection', name: 'Assembly', itemListElement: [{ text: 'Layer.' }] },
      ]),
    ).toEqual(['Melt butter.', 'Whisk in flour.', 'Layer.']);
  });

  it('recurses into grouping nodes without a HowToSection @type', () => {
    expect(
      flattenInstructions([
        { itemListElement: [{ text: 'Untyped group step.' }] },
        { '@type': 'ItemList', itemListElement: ['ItemList step.'] },
        { steps: [{ text: 'Nested via steps.' }] },
      ]),
    ).toEqual(['Untyped group step.', 'ItemList step.', 'Nested via steps.']);
  });

  it('strips HTML tags and decodes entities in step text', () => {
    expect(flattenInstructions([{ text: 'Salt &amp; pepper,&nbsp;<b>to taste</b> &#39;n&#x27; serve' }])).toEqual([
      "Salt & pepper, to taste 'n' serve",
    ]);
  });

  it('drops empty and non-text entries', () => {
    expect(flattenInstructions(['', '  ', null, 42, { text: '' }, { foo: 'bar' }, 'Real step.'])).toEqual([
      'Real step.',
    ]);
  });

  it('returns nothing for missing instructions', () => {
    expect(flattenInstructions(undefined)).toEqual([]);
    expect(flattenInstructions(null)).toEqual([]);
  });
});

describe('looksLikeSectionHeader', () => {
  it.each(['For the dressing', 'For a crumble topping', 'To serve', 'To make the paste', 'Sauce:', 'For the curry /', 'DRESSING', 'Garnish'])(
    '%j is a header',
    (line) => {
      expect(looksLikeSectionHeader(line)).toBe(true);
    },
  );

  it.each([
    '2 tbsp olive oil',
    '½ lemon',
    'Salt',
    'Thai chillies, to taste', // unquantified ingredients are not headings
    'Fresh cilantro for garnish',
    'Dressing of choice',
    'Fortified wine',
    'For',
    '',
    'x'.repeat(61),
  ])('%j is not a header', (line) => {
    expect(looksLikeSectionHeader(line)).toBe(false);
  });
});

describe('buildIngredientSections', () => {
  it('groups ingredients under the headers that precede them', () => {
    const sections = buildIngredientSections([
      '400 g chicken',
      '1 onion',
      'For the sauce:',
      '2 tbsp soy sauce',
      'Salt',
    ]);

    expect(sections.map((s) => [s.title, s.ingredients.map((i) => i.name)])).toEqual([
      ['', ['chicken', 'onion']],
      ['For the sauce', ['soy sauce', 'Salt']],
    ]);
  });

  it('does not split the list at an unquantified ingredient', () => {
    const sections = buildIngredientSections(['1 green papaya', 'Thai chillies, to taste', '2 tbsp fish sauce']);

    expect(sections).toHaveLength(1);
    expect(sections[0].ingredients).toHaveLength(3);
  });

  it('trims trailing slash and colon from titles', () => {
    expect(buildIngredientSections(['For the curry /', '1 tsp cumin'])[0].title).toBe('For the curry');
  });

  it('drops a header with nothing under it', () => {
    const sections = buildIngredientSections(['For the base:', 'For the topping:', '100 g sugar']);
    expect(sections.map((s) => s.title)).toEqual(['For the topping']);
  });

  it('always returns at least one section', () => {
    expect(buildIngredientSections([])).toEqual([{ title: '', ingredients: [] }]);
  });
});

describe('parseRecipeText', () => {
  it('uses explicit Ingredients and Method headers', () => {
    const result = parseRecipeText(
      [
        'Lemon Drizzle Cake',
        'Serves 8 · Prep: 15 mins · Total: 1 hour',
        'Ingredients',
        '225 g butter',
        '225 g caster sugar',
        '4 eggs',
        'Method',
        '1. Heat the oven to 180C.',
        '2. Beat the butter and sugar',
        'until pale and fluffy.',
        '3. Bake for 45 minutes.',
      ].join('\n'),
    );

    expect(result.title).toBe('Lemon Drizzle Cake');
    expect(result.servings).toBe(8);
    expect(result.prepTime).toBe('15 mins');
    expect(result.totalTime).toBe('1 hour');
    expect(result.ingredientSections[0].ingredients.map((i) => i.name)).toEqual(['butter', 'caster sugar', 'eggs']);
    expect(result.steps).toEqual([
      'Heat the oven to 180C.',
      'Beat the butter and sugar until pale and fluffy.',
      'Bake for 45 minutes.',
    ]);
  });

  it('splits at the first numbered step when there is no Method header', () => {
    const result = parseRecipeText(
      ['Pancakes', 'Ingredients', '100 g flour', '2 eggs', '300 ml milk', '1. Whisk it all.', '2. Fry.'].join('\n'),
    );

    expect(result.ingredientSections[0].ingredients).toHaveLength(3);
    expect(result.steps).toEqual(['Whisk it all.', 'Fry.']);
  });

  it('takes amount-led lines before the Method header as ingredients', () => {
    const result = parseRecipeText(
      ['Quick Soup', 'Serves 2', '1 onion', '500 ml stock', 'Method', 'Simmer everything together until soft.'].join('\n'),
    );

    expect(result.ingredientSections[0].ingredients.map((i) => i.name)).toEqual(['onion', 'stock']);
    expect(result.servings).toBe(2);
    expect(result.steps).toEqual(['Simmer everything together until soft.']);
  });

  it('finds the ingredient block in cookbook layouts without any headers', () => {
    const result = parseRecipeText(
      [
        'Chicken Curry',
        'For the curry /',
        '2 tbsp oil',
        '1 onion, chopped',
        '500 g chicken thighs',
        'Heat the oil in a large pan and fry the onion until golden and soft.',
        '4 minutes, stirring, then add the chicken and cook through completely.',
      ].join('\n'),
    );

    expect(result.title).toBe('Chicken Curry');
    expect(result.ingredientSections).toHaveLength(1);
    expect(result.ingredientSections[0].title).toBe('For the curry');
    expect(result.ingredientSections[0].ingredients.map((i) => i.name)).toEqual([
      'oil',
      'onion, chopped',
      'chicken thighs',
    ]);
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps.join(' ')).toContain('Heat the oil');
  });

  it('re-joins an unnumbered OCR method and splits it into sentences', () => {
    const result = parseRecipeText(
      ['Toast', 'Ingredients', '2 slices bread', 'Method', 'Put the bread in the', 'toaster. Wait until golden.', 'Butter generously.'].join(
        '\n',
      ),
    );

    expect(result.steps).toEqual(['Put the bread in the toaster.', 'Wait until golden.', 'Butter generously.']);
  });

  it('rejoins words hyphenated across a line break', () => {
    const result = parseRecipeText(['Stew', 'Ingredients', '1 kg beef', 'Method', 'Cook slowly until ten-', 'der.'].join('\n'));

    expect(result.steps).toEqual(['Cook slowly until tender.']);
  });

  it('does not mistake "cook for 5 minutes" in the method for a total time', () => {
    const result = parseRecipeText(['Eggs', 'Ingredients', '2 eggs', 'Method', 'Cook for 5 minutes.'].join('\n'));

    expect(result.totalTime).toBe('');
    expect(result.steps).toEqual(['Cook for 5 minutes.']);
  });

  it('falls back to sensible defaults', () => {
    const result = parseRecipeText('123\n456');

    expect(result.title).toBe('Scanned Recipe');
    expect(result.servings).toBe(4);
    expect(result.prepTime).toBe('');
  });
});
