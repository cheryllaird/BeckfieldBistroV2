import { describe, expect, it } from 'vitest';
import { NOT_OURS, planLegacySync, seedLedger, type LedgerEntry } from './legacySync';

const map = <V>(o: Record<string, V>) => new Map(Object.entries(o));

describe('planLegacySync with a ledger', () => {
  const plan = (
    legacy: Record<string, number>,
    bistro: Record<string, number>,
    ledger: Record<string, LedgerEntry>,
  ) => planLegacySync({ legacy: map(legacy), bistro: map(bistro), ledger: map(ledger), since: 0, migratedTo: 0 });

  it('does nothing when neither side has changed since the copy', () => {
    expect(plan({ a: 10 }, { a: 20 }, { a: { legacy: 10, bistro: 20 } })).toEqual({ copy: [], remove: [], forget: [] });
  });

  it('copies an old-app edit made after the copy', () => {
    expect(plan({ a: 30 }, { a: 20 }, { a: { legacy: 10, bistro: 20 } }).copy).toEqual(['a']);
  });

  it('copies a doc that is new in the old app, however early it was written', () => {
    // e.g. added by an old-app device while the original copy was running,
    // with an id the copy had already passed.
    expect(plan({ fresh: 5 }, {}, {}).copy).toEqual(['fresh']);
  });

  it('keeps a new-app deletion even when the old app edited the doc', () => {
    // Old app edits R, then a member deletes R in the new app.
    expect(plan({ r: 30 }, {}, { r: { legacy: 10, bistro: 20 } })).toEqual({ copy: [], remove: [], forget: [] });
  });

  it('applies an old-app deletion to an untouched copy, including one a sync made', () => {
    expect(plan({}, { a: 20, synced: 50 }, { a: { legacy: 10, bistro: 20 }, synced: { legacy: 40, bistro: 50 } })).toEqual({
      copy: [],
      remove: ['a', 'synced'],
      forget: ['a', 'synced'],
    });
  });

  it('keeps a doc deleted in the old app but edited in the new app since the copy', () => {
    expect(plan({}, { a: 60 }, { a: { legacy: 10, bistro: 20 } })).toEqual({ copy: [], remove: [], forget: ['a'] });
  });

  it('never removes docs created in the new app', () => {
    expect(plan({}, { newRecipe: 5 }, {})).toEqual({ copy: [], remove: [], forget: [] });
  });

  it('lets the newer edit win when both sides edited', () => {
    expect(plan({ a: 70 }, { a: 60 }, { a: { legacy: 10, bistro: 20 } }).copy).toEqual(['a']);
    expect(plan({ a: 50 }, { a: 60 }, { a: { legacy: 10, bistro: 20 } }).copy).toEqual([]);
  });

  it('treats a NOT_OURS entry as present but never as an untouched copy', () => {
    const entry = { a: { legacy: 10, bistro: NOT_OURS } };
    expect(plan({}, { a: 20 }, entry).remove).toEqual([]); // not removed
    expect(plan({ a: 30 }, {}, entry).copy).toEqual([]); // deletion stands
    expect(plan({ a: 30 }, { a: 20 }, entry).copy).toEqual(['a']); // newer wins
  });
});

describe('planLegacySync without a ledger (accounts migrated before ledgers)', () => {
  // Original copy ran 100→200; its start is only estimated (`since`).
  const plan = (legacy: Record<string, number>, bistro: Record<string, number>) =>
    planLegacySync({ legacy: map(legacy), bistro: map(bistro), ledger: null, since: 100, migratedTo: 200 });

  it('copies edits and docs written after the copy started', () => {
    expect(plan({ a: 300, fresh: 150 }, { a: 150 }).copy).toEqual(['a', 'fresh']);
  });

  it('does not resurrect a doc that existed before the copy', () => {
    expect(plan({ a: 50 }, {}).copy).toEqual([]);
  });

  it('removes untouched migration copies deleted in the old app, keeps new-app docs', () => {
    expect(plan({}, { a: 150, newer: 250 }).remove).toEqual(['a']);
  });
});

describe('seedLedger', () => {
  it('records every doc on both sides, marking only untouched copies as ours', () => {
    const ledger = seedLedger(
      map({ untouched: 10, editedInNewApp: 10, justCopied: 300, onlyLegacy: 10 }),
      map({ untouched: 150, editedInNewApp: 250, justCopied: 400 }),
      map({ justCopied: 400 }),
      200,
    );
    expect(Object.fromEntries(ledger)).toEqual({
      untouched: { legacy: 10, bistro: 150 },
      editedInNewApp: { legacy: 10, bistro: NOT_OURS },
      justCopied: { legacy: 300, bistro: 400 },
    });
  });
});
