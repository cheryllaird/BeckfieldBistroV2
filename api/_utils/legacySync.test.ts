import { describe, expect, it } from 'vitest';
import { planLegacySync } from './legacySync';

// Timeline: migration copy ran 100→200 (the app was blocked meanwhile), the
// last completed sync started at 300. Times are server write times.
const MIGRATED_TO = 200;
const SINCE = 300;

const plan = (legacy: Record<string, number>, bistro: Record<string, number>) =>
  planLegacySync(new Map(Object.entries(legacy)), new Map(Object.entries(bistro)), SINCE, MIGRATED_TO);

describe('planLegacySync', () => {
  it('does nothing when neither side has changed since the copy', () => {
    expect(plan({ a: 50, b: 60 }, { a: 150, b: 160 })).toEqual({ copy: [], remove: [] });
  });

  it('copies a doc edited in the old app after the copy', () => {
    expect(plan({ a: 400 }, { a: 150 })).toEqual({ copy: ['a'], remove: [] });
  });

  it('keeps the new-app version when it is newer than the old-app edit', () => {
    expect(plan({ a: 400 }, { a: 500 })).toEqual({ copy: [], remove: [] });
  });

  it('copies a doc created in the old app after the last sync started', () => {
    expect(plan({ a: 50, fresh: 350 }, { a: 150 })).toEqual({ copy: ['fresh'], remove: [] });
  });

  it('does not resurrect a doc deleted in the new app', () => {
    // Existed (unchanged) in legacy before the last sync, missing from the bistro.
    expect(plan({ a: 50 }, {})).toEqual({ copy: [], remove: [] });
  });

  it('removes a doc deleted in the old app if the new app never touched it', () => {
    expect(plan({}, { a: 150 })).toEqual({ copy: [], remove: ['a'] });
  });

  it('never removes docs created or edited in the new app', () => {
    // Created in the new app (or edited there after migration): not in legacy,
    // but written after the migration copy.
    expect(plan({}, { newRecipe: 250, edited: 600 })).toEqual({ copy: [], remove: [] });
  });

  it('treats the boundaries conservatively', () => {
    // Exactly at `since`: already covered by the last copy.
    expect(plan({ a: SINCE }, {})).toEqual({ copy: [], remove: [] });
    // Exactly at migratedTo: still an untouched migration copy.
    expect(plan({}, { a: MIGRATED_TO })).toEqual({ copy: [], remove: ['a'] });
    // A tie between the two sides keeps the bistro copy.
    expect(plan({ a: 500 }, { a: 500 })).toEqual({ copy: [], remove: [] });
  });
});
