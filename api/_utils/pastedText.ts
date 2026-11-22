// Clean-up for recipe text a user copied from a web page and pasted in, before
// the deterministic local parser reads it. Copying a page drags in clutter
// around the recipe (skip links, shopping buttons, ratings, share links) that
// the parser would otherwise take for the title or glue onto the last step.
//
// Only whole lines that are clearly page furniture are dropped, so recipe
// wording is never edited.

const CLUTTER_LINES: RegExp[] = [
  /^skip to (main )?content$/i,
  /^(add to (trolley|basket|cart|favourites|list|shopping list)|add all to (trolley|basket))$/i,
  /^(save|print|share|jump to recipe|print recipe|save recipe|pin it|email)( this recipe)?$/i,
  /^rate this recipe$/i,
  /^(write a|read( all)?|\d+) reviews?$/i,
  /^[\d.]+ out of 5( stars)?( \(?\d+ (reviews?|ratings?)\)?)?$/i,
  /^(\d+ )?(reviews?|ratings?|comments?)$/i,
  /^(accept|reject|manage) (all )?cookies$/i,
  /^cookie (settings|preferences)$/i,
  /^advertisement$/i,
];

/** Drops lines that are page clutter rather than recipe. Keeps line breaks. */
export function stripWebClutter(text: string): string {
  return text
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !CLUTTER_LINES.some((re) => re.test(t));
    })
    .join('\n');
}
