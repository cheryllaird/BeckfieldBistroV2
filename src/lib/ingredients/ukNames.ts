// American (and other non-UK) ingredient names → the name a UK supermarket
// shelves them under. Applied word-by-word before any other canonicalisation,
// so every later rule only ever sees UK names, and "cilantro" and "coriander"
// land on the same shopping list line as "coriander".
//
// Where a rule captures a plural suffix it is carried over ("scallions" →
// "spring onions"), so the display name keeps its number and the dedup key
// still matches the singular.
const UK_NAME_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  // Herbs and veg
  [/\bcilantro\b/g, 'coriander'],
  [/\bzucchini(s?)\b/g, 'courgette$1'],
  [/\beggplant(s?)\b/g, 'aubergine$1'],
  [/\b(?:scallion|green onion)(s?)\b/g, 'spring onion$1'],
  [/\barugula\b/g, 'rocket'],
  [/\brutabaga(s?)\b/g, 'swede$1'],
  [/\bbeets?\b/g, 'beetroot'],
  [/\bsnow peas?\b/g, 'mangetout'],
  [/\b(?:bok|pak) cho[iy]\b/g, 'pak choi'],
  [/\bitalian parsley\b/g, 'parsley'],
  // "Bell pepper" alone stays as it is: a bare "pepper" would collide with
  // black pepper in the store cupboard.
  [/\b(red|green|yellow|orange) bell pepper(s?)\b/g, '$1 pepper$2'],
  [/\b(?:red pepper flakes|crushed red pepper(?: flakes)?)\b/g, 'chilli flakes'],
  [/\bchil(?:li|i|e)e?s\b/g, 'chillies'],
  [/\bchil(?:i|e)\b/g, 'chilli'],
  // Pulses
  [/\bgarbanzo(?: bean)?(s?)\b/g, 'chickpea$1'],
  [/\bfava bean(s?)\b/g, 'broad bean$1'],
  [/\blima bean(s?)\b/g, 'butter bean$1'],
  [/\bnavy bean(s?)\b/g, 'haricot bean$1'],
  // Fish and meat
  [/\bshrimps?\b/g, 'prawns'],
  [/\bcanadian bacon\b/g, 'back bacon'],
  // Dairy
  [/\bheavy (?:whipping )?cream\b/g, 'double cream'],
  [/\blight cream\b/g, 'single cream'],
  [/\bsour cream\b/g, 'soured cream'],
  [/\bskim milk\b/g, 'skimmed milk'],
  [/\byogurt(s?)\b/g, 'yoghurt$1'],
  // Baking
  [/\ball[- ]purpose flour\b/g, 'plain flour'],
  [/\bself[- ]rising\b|\bself raising\b/g, 'self-raising'],
  [/\bcorn ?starch\b/g, 'cornflour'],
  [/\b(?:powdered|confectioners'?|confectioner's) sugar\b/g, 'icing sugar'],
  [/\bsuperfine sugar\b/g, 'caster sugar'],
  [/\bbaking soda\b|\bbicarb(?:onate)? soda\b/g, 'bicarbonate of soda'],
  [/\bgolden raisin(s?)\b/g, 'sultana$1'],
  // Cupboard
  [/\bcanola oil\b/g, 'rapeseed oil'],
  [/\bcanned\b/g, 'tinned'],
  // UK "tomato purée" is the concentrated paste.
  [/\btomato paste\b/g, 'tomato purée'],
];

/** Rewrites US and other regional ingredient names in lower-case text to UK ones. */
export function toUkNames(text: string): string {
  return UK_NAME_RULES.reduce((s, [pattern, replacement]) => s.replace(pattern, replacement), text);
}
