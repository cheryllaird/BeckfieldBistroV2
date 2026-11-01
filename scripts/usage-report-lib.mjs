// Pure aggregation for scripts/usage-report.mjs. Takes plain data (no Firestore
// types) and returns figures with no uids, bistro/recipe ids, item names or
// titles. Any count under MIN_GROUP is reported as '<3' so a figure can't point
// at one person's library.

export const MIN_GROUP = 3;
export const WEEKS = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A count, or '<3' when it is small enough to identify one bistro. */
export function suppress(n) {
  return n < MIN_GROUP ? `<${MIN_GROUP}` : n;
}

function sortedCounts(map) {
  return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function suppressAll(map) {
  return Object.fromEntries(Object.entries(sortedCounts(map)).map(([k, n]) => [k, suppress(n)]));
}

function bucket(n, edges) {
  for (const [max, label] of edges) if (n <= max) return label;
  return edges[edges.length - 1][1];
}

const COUNT_BUCKETS = [[0, '0'], [5, '1-5'], [20, '6-20'], [50, '21-50'], [Infinity, '51+']];
const MEMBER_BUCKETS = [[1, '1'], [2, '2'], [4, '3-4'], [Infinity, '5+']];

function bucketCounts(values, edges) {
  const m = new Map(edges.map(([, label]) => [label, 0]));
  for (const v of values) m.set(bucket(v, edges), m.get(bucket(v, edges)) + 1);
  return Object.fromEntries([...m].map(([k, n]) => [k, suppress(n)]));
}

/** Monday 00:00 UTC of the week containing epoch ms `t`, as YYYY-MM-DD. */
export function weekStart(t) {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function mergeCounts(target, source) {
  for (const [k, n] of Object.entries(source ?? {})) target.set(k, (target.get(k) ?? 0) + n);
}

function extractionFigures({ lifetime, daily }, now) {
  const since = new Date(now - 30 * DAY_MS).toISOString().slice(0, 10);
  const recent = { counts: new Map(), reasons: new Map(), total: 0 };
  for (const d of daily ?? []) {
    if (!d.date || d.date < since) continue;
    mergeCounts(recent.counts, d.counts);
    mergeCounts(recent.reasons, d.fallbackReasons);
    recent.total += d.total ?? 0;
  }
  const life = { counts: new Map(), reasons: new Map() };
  mergeCounts(life.counts, lifetime?.counts);
  mergeCounts(life.reasons, lifetime?.fallbackReasons);
  // Aggregate counters across all users, not per-bistro figures, so they need no suppression.
  return {
    lifetime: { total: lifetime?.total ?? 0, methods: sortedCounts(life.counts), fallbackReasons: sortedCounts(life.reasons) },
    last30Days: { total: recent.total, methods: sortedCounts(recent.counts), fallbackReasons: sortedCounts(recent.reasons) },
  };
}

/**
 * @param {{
 *   extraction?: { lifetime?: object, daily?: object[] },
 *   bistros: Array<{
 *     memberCount: number,
 *     recipes: Array<{ updateTime: number }>,
 *     mealEntries: Array<{ type?: string, recipeId?: string, updateTime: number }>,
 *     pantryItems: Array<{ inStock?: boolean, updateTime: number }>,
 *     shoppingItems: Array<{ updateTime: number }>,
 *     categoryLogs: Array<{ ingredientKey?: string, source?: string, fromCategory: string, toCategory: string }>,
 *   }>,
 *   unmigratedUsers: number,
 * }} input
 * @param {number} now epoch ms
 */
export function aggregateUsage(input, now = Date.now()) {
  const { bistros } = input;

  // Category moves.
  const moves = new Map();
  const keyBistros = new Map(); // ingredientKey -> Set of bistro indexes
  const keyMoves = new Map();
  bistros.forEach((b, i) => {
    for (const log of b.categoryLogs) {
      const move = `${log.source ?? 'unknown'}: ${log.fromCategory}→${log.toCategory}`;
      moves.set(move, (moves.get(move) ?? 0) + 1);
      if (log.ingredientKey) {
        if (!keyBistros.has(log.ingredientKey)) keyBistros.set(log.ingredientKey, new Set());
        keyBistros.get(log.ingredientKey).add(i);
        keyMoves.set(log.ingredientKey, (keyMoves.get(log.ingredientKey) ?? 0) + 1);
      }
    }
  });
  const namedKeys = new Map();
  let otherKeyMoves = 0;
  for (const [key, n] of keyMoves) {
    if (keyBistros.get(key).size >= MIN_GROUP) namedKeys.set(key, n);
    else otherKeyMoves += n;
  }

  // Pantry.
  const withPantry = bistros.filter((b) => b.pantryItems.length > 0);
  const pantryTotal = withPantry.reduce((s, b) => s + b.pantryItems.length, 0);
  const inStock = withPantry.reduce((s, b) => s + b.pantryItems.filter((p) => p.inStock !== false).length, 0);

  // Meal entries.
  const types = new Map();
  for (const b of bistros) for (const e of b.mealEntries) types.set(e.type ?? 'unknown', (types.get(e.type ?? 'unknown') ?? 0) + 1);

  // Weekly active bistros.
  const weeks = new Map();
  for (const b of bistros) {
    const active = new Set();
    for (const doc of [...b.recipes, ...b.mealEntries, ...b.pantryItems, ...b.shoppingItems]) {
      if (typeof doc.updateTime === 'number') active.add(weekStart(doc.updateTime));
    }
    for (const w of active) weeks.set(w, (weeks.get(w) ?? 0) + 1);
  }
  const thisWeek = Date.parse(weekStart(now));
  const weekly = {};
  for (let i = WEEKS - 1; i >= 0; i--) {
    const w = new Date(thisWeek - i * 7 * DAY_MS).toISOString().slice(0, 10);
    weekly[w] = suppress(weeks.get(w) ?? 0);
  }

  return {
    bistros: suppress(bistros.length),
    extraction: extractionFigures(input.extraction ?? {}, now),
    categoryMoves: {
      byMove: suppressAll(moves),
      namedIngredients: sortedCounts(namedKeys),
      otherIngredients: suppress(otherKeyMoves),
    },
    pantry: {
      bistrosWithPantry: suppress(withPantry.length),
      inStockShare: withPantry.length >= MIN_GROUP && pantryTotal > 0 ? Math.round((inStock / pantryTotal) * 100) / 100 : '<3',
    },
    mealEntryTypes: suppressAll(types),
    recipesPerBistro: bucketCounts(bistros.map((b) => b.recipes.length), COUNT_BUCKETS),
    recipesEverPlannedPerBistro: bucketCounts(
      bistros.map((b) => new Set(b.mealEntries.map((e) => e.recipeId).filter(Boolean)).size),
      COUNT_BUCKETS,
    ),
    membersPerBistro: bucketCounts(bistros.map((b) => b.memberCount), MEMBER_BUCKETS),
    weeklyActiveBistros: weekly,
    unmigratedAccounts: suppress(input.unmigratedUsers),
  };
}
