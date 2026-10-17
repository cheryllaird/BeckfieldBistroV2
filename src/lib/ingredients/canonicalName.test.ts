import { describe, expect, it } from 'vitest';
import { canonicalizeIngredientName, normalizeIngredientName } from './canonicalName';

describe('canonicalizeIngredientName', () => {
  it.each([
    // Prep instructions after a comma are dropped...
    ['Broccoli, cut into florets', 'broccoli'],
    ['onion, finely chopped', 'onion'],
    ['salt, to taste', 'salt'],
    ['butter, at room temperature', 'butter'],
    ['flour, plus extra for dusting', 'flour'],
    // ...but clauses that name the ingredient survive, folded in front of it
    ['flour, self-raising', 'self-raising flour'],
    ['chicken thighs, bone-in', 'bone-in chicken thighs'],
    ['almonds, ground', 'ground almonds'],
    ['tuna, in spring water', 'tuna, in spring water'],
    // Alternatives: the list buys the first option
    ['Shallots, or red onion', 'shallots'],
    ['chicken stock (or vegetable stock)', 'chicken stock'],
    // Cut shapes are prep
    ['spring onions, thin strips', 'spring onions'],
    ['carrots, cut into matchsticks', 'carrots'],
    ['potatoes, peeled and cut into 2cm chunks', 'potatoes'],
    ['red chilli, in rings', 'red chilli'],
    ['parsley, leaves picked', 'parsley'],
    ['eggs, large', 'eggs'],
    ['coriander, roughly chopped, to serve', 'coriander'],
    ['chicken, for the stock', 'chicken'],
    ['tomatoes, sun-dried', 'sun-dried tomatoes'],
    ['chicken thighs, skin on', 'chicken thighs, skin on'],
    // Amounts written into the name
    ['2 shallots, thinly sliced', 'shallots'],
    ['400g chopped tomatoes', 'chopped tomatoes'],
    ['00 flour', '00 flour'],
    ['thumb-sized piece of ginger, grated', 'ginger'],
    ['juice of half a lemon', 'lemon'],
    // Bare "chopped tomatoes" is the tin; chopped by hand they're just tomatoes
    ['chopped tomatoes (400g tin)', 'chopped tomatoes'],
    ['finely chopped tomatoes', 'tomatoes'],
    // "minced" names the product for meats sold as mince, and is prep otherwise
    ['minced beef', 'beef mince'],
    ['ground beef', 'beef mince'],
    ['minced garlic', 'garlic'],
    ['beef, minced', 'beef mince'],
    ['garlic, minced', 'garlic'],
    // "ground" names the product unless a modifier makes it a step
    ['ground almonds', 'ground almonds'],
    ['freshly ground black pepper', 'black pepper'],
    // Leading prep descriptors
    ['finely chopped parsley', 'parsley'],
    ['diced onion', 'onion'],
    // Juice consolidates with the whole fruit
    ['juice of 2 lemons', 'lemon'],
    ['lemon juice', 'lemon'],
    ['limes juice', 'lime'],
    // Portioning words
    ['garlic cloves', 'garlic'],
    ['basil leaves', 'basil'],
    ['lemon wedges', 'lemon'],
    // Quality modifiers
    ['extra virgin olive oil', 'olive oil'],
    ['flat-leaf parsley', 'parsley'],
    // US → UK synonyms
    ['cilantro', 'coriander'],
    ['zucchini', 'courgette'],
    ['eggplant', 'aubergine'],
    ['scallion', 'spring onion'],
    ['scallions', 'spring onions'],
    ['green onion', 'spring onion'],
    ['green onions', 'spring onions'],
    ['zucchinis', 'courgettes'],
    ['eggplants', 'aubergines'],
    ['2 large eggplants', 'aubergines'],
    ['arugula', 'rocket'],
    ['fresh cilantro leaves', 'coriander'],
    ['Fresh coriander (cilantro)', 'coriander'],
    ['spring onions (scallions)', 'spring onions'],
    ['handful fresh coriander', 'coriander'],
    ['chopped fresh coriander', 'coriander'],
    ['fresh chopped coriander', 'coriander'],
    ['heavy cream', 'double cream'],
    ['all-purpose flour', 'plain flour'],
    ['self-rising flour', 'self-raising flour'],
    ['cornstarch', 'cornflour'],
    ['powdered sugar', 'icing sugar'],
    ["confectioners' sugar", 'icing sugar'],
    ['baking soda', 'bicarbonate of soda'],
    ['shrimp', 'prawns'],
    ['garbanzo beans', 'chickpeas'],
    ['snow peas', 'mangetout'],
    ['bok choy', 'pak choi'],
    ['beets', 'beetroot'],
    ['golden raisins', 'sultanas'],
    ['red bell pepper', 'red pepper'],
    ['bell pepper', 'bell pepper'],
    ['chili flakes', 'chilli flakes'],
    ['red pepper flakes', 'chilli flakes'],
    ['chiles', 'chillies'],
    ['tomato paste', 'tomato purée'],
  ])('%j → %j', (input, expected) => {
    expect(canonicalizeIngredientName(input)).toBe(expected);
  });
});

describe('normalizeIngredientName', () => {
  it.each([
    ['scallions', 'spring onions'],
    ['green onions', 'spring onion'],
    ['zucchinis', 'courgette'],
    ['eggplants', 'aubergine'],
    ['cilantro', 'Coriander'],
    ['Shallots, or red onion', 'shallot'],
    ['spring onions, thin strips', 'spring onion'],
    ['chilies', 'chilli'],
    ['tomato puree', 'tomato paste'],
    ['crème fraîche', 'creme fraiche'],
    ['almonds, ground', 'ground almonds'],
  ])('gives %j the same key as %j', (us, uk) => {
    expect(normalizeIngredientName(us)).toBe(normalizeIngredientName(uk));
  });

  it.each([
    ['tomatoes', 'tomato'],
    ['cherries', 'cherry'],
    ['carrots', 'carrot'],
    ['Garlic Cloves', 'garlic'],
    ['hummus', 'hummus'],
    ['swiss', 'swiss'],
    ['couscous', 'couscous'],
    ['chillies', 'chilli'],
    ['bay leaves', 'bay leaf'],
    ['lime leaves', 'lime leaf'],
    ['jalapeños', 'jalapeno'],
  ])('%j → %j', (input, expected) => {
    expect(normalizeIngredientName(input)).toBe(expected);
  });
});
