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

  it('keeps the descriptive notes in the name, as the recipe shows them', () => {
    expect(parseIngredientLine('3 spring onions, thin strips')).toMatchObject({ name: 'spring onions, thin strips', quantity: 3 });
    expect(parseIngredientLine('1 onion, finely chopped')).toMatchObject({ name: 'onion, finely chopped', quantity: 1 });
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

  describe('photographed cookbook pages', () => {
    // Invented text shaped like real Tesseract output of magazine pages: bullet
    // glyphs, wrapped lines, nutrition boxes, page numbers and edge junk.
    const magazinePage = [
      'Ray - ==',
      'SERVES 4',
      'HANDS-ON TIME 20 mins',
      'ROASTED CARROT',
      'AND LENTIL SALAD',
      '‘A bright, crunchy salad for warm evenings.',
      '# 4 carrots, peeled',
      'and cut into batons',
      '@ 1 tbsp olive oil',
      '© 1 x 250g pouch cooked',
      'puy lentils',
      'For the dressing',
      '# 2 tbsp lemon juice',
      '¢ 1 tsp honey',
      '# 1 tsp cumin seeds',
      '| PER SERVING',
      '310cals; 12g fat (2g sat fat);',
      '11g protein; 9g fibre; 35g carbs',
      '1 Heat the oven to 200C. Toss the carrots with the',
      'oil and roast for 25 minutes.',
      '2 Warm the lentils. Whisk the lemon juice, honey and',
      'cumin, then toss everything together.',
      '175',
      'h h 4 Fla',
    ].join('\n');

    it('reads bulleted ingredients and joins their wrapped lines', () => {
      const result = parseRecipeText(magazinePage);
      const all = result.ingredientSections.flatMap((s) => s.ingredients.map((i) => i.originalText));

      expect(all).toEqual([
        '4 carrots, peeled and cut into batons',
        '1 tbsp olive oil',
        '1 x 250g pouch cooked puy lentils',
        '2 tbsp lemon juice',
        '1 tsp honey',
        '1 tsp cumin seeds',
      ]);
      expect(result.ingredientSections.map((s) => s.title)).toEqual(['', 'For the dressing']);
    });

    it('keeps nutrition, page numbers and junk out of every field', () => {
      const result = parseRecipeText(magazinePage);
      const everything = JSON.stringify(result);

      for (const junk of ['cals', 'protein', '175', 'Ray', 'Fla', 'PER SERVING']) expect(everything).not.toContain(junk);
    });

    it('splits a magazine-numbered method into its steps', () => {
      expect(parseRecipeText(magazinePage).steps).toEqual([
        'Heat the oven to 200C. Toss the carrots with the oil and roast for 25 minutes.',
        'Warm the lentils. Whisk the lemon juice, honey and cumin, then toss everything together.',
      ]);
    });

    it('takes the capitals title across its wrapped line, skipping junk and the pull-quote', () => {
      expect(parseRecipeText(magazinePage).title).toBe('ROASTED CARROT AND LENTIL SALAD');
    });

    it('does not let a stray amount line after the method swallow it', () => {
      const result = parseRecipeText(
        [
          'Bean Stew',
          '2 tbsp oil',
          '1 onion, sliced',
          '400g tin beans',
          'Fry the onion in the oil until soft and golden, about ten minutes.',
          'Add the beans and simmer gently until thick.',
          '2 x 400g',
        ].join('\n'),
      );

      expect(result.steps.join(' ')).toContain('Fry the onion');
      expect(result.steps.join(' ')).toContain('Add the beans');
    });

    it('splits two ingredient columns read as one line at the mid-line bullet', () => {
      const result = parseRecipeText(
        ['Soup', '# 2 tbsp olive oil # 1 x 400g tin beans', '# 1 onion, diced # 500ml stock', '# 1 tsp salt'].join('\n'),
      );

      expect(result.ingredientSections[0].ingredients.map((i) => i.originalText)).toEqual([
        '2 tbsp olive oil',
        '1 x 400g tin beans',
        '1 onion, diced',
        '500ml stock',
        '1 tsp salt',
      ]);
    });

    it('splits an unnumbered method into paragraphs where a short line ends a sentence', () => {
      const result = parseRecipeText(
        [
          'Bean Stew',
          'Ingredients',
          '1 onion',
          'Method',
          'Fry the onion in a large pan over a medium heat until',
          'it is soft and golden, stirring now and then.',
          'Add the beans and the stock, bring to the boil, then',
          'simmer for twenty minutes until thick.',
        ].join('\n'),
      );

      expect(result.steps).toEqual([
        'Fry the onion in a large pan over a medium heat until it is soft and golden, stirring now and then.',
        'Add the beans and the stock, bring to the boil, then simmer for twenty minutes until thick.',
      ]);
    });

    it('keeps a short wrapped method line that the old length filter dropped', () => {
      const result = parseRecipeText(
        ['Rice', '200g rice', '400ml water', 'Rinse the rice, then bring it to the boil in the water and', 'cover.'].join('\n'),
      );

      expect(result.steps.join(' ')).toContain('cover.');
    });
  });

  it('falls back to sensible defaults', () => {
    const result = parseRecipeText('123\n456');

    expect(result.title).toBe('Scanned Recipe');
    expect(result.servings).toBe(4);
    expect(result.prepTime).toBe('');
  });
});
