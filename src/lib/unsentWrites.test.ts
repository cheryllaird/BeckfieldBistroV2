import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearUnsentWrites,
  forgetUnsentWrite,
  readUnsentWrites,
  recordUnsentWrite,
} from './unsentWrites';

const meal = { id: 'm1', date: '2026-11-21', type: 'custom' as const, servings: 2 };
const base = { uid: 'me', bistroId: 'b', collection: 'mealEntries' as const, id: 'm1' };

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()));

describe('unsent writes outbox', () => {
  it('records a write and reads it back', () => {
    recordUnsentWrite({ ...base, kind: 'set', data: meal });
    expect(readUnsentWrites()).toEqual([expect.objectContaining({ ...base, kind: 'set', data: meal })]);
  });

  it('keeps only the latest write for a doc', () => {
    recordUnsentWrite({ ...base, kind: 'set', data: meal });
    recordUnsentWrite({ ...base, kind: 'delete' });
    expect(readUnsentWrites()).toEqual([expect.objectContaining({ id: 'm1', kind: 'delete' })]);
  });

  it('forgets a record, but not a newer one for the same doc', () => {
    recordUnsentWrite({ ...base, kind: 'set', data: meal });
    const [older] = readUnsentWrites();
    recordUnsentWrite({ ...base, kind: 'delete' });

    forgetUnsentWrite(older);
    expect(readUnsentWrites()).toEqual([expect.objectContaining({ kind: 'delete' })]);

    forgetUnsentWrite(readUnsentWrites()[0]);
    expect(readUnsentWrites()).toEqual([]);
    expect(localStorage.getItem('bistro-unsent-writes')).toBeNull();
  });

  it('keeps writes to different docs and bistros apart', () => {
    recordUnsentWrite({ ...base, kind: 'delete' });
    recordUnsentWrite({ ...base, bistroId: 'other', kind: 'delete' });
    recordUnsentWrite({ ...base, collection: 'pantryItems', id: 'p1', kind: 'delete' });
    expect(readUnsentWrites()).toHaveLength(3);
    clearUnsentWrites();
    expect(readUnsentWrites()).toEqual([]);
  });

  it('treats corrupt storage as empty', () => {
    localStorage.setItem('bistro-unsent-writes', '{not json');
    expect(readUnsentWrites()).toEqual([]);
  });
});
