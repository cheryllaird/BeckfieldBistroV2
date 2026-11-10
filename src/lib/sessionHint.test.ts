import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hadSession, setSessionHint } from './sessionHint';

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage());
});

describe('session hint', () => {
  it('is unset on a fresh device', () => {
    expect(hadSession()).toBe(false);
  });

  it('remembers a signed-in session and forgets it on sign-out', () => {
    setSessionHint(true);
    expect(hadSession()).toBe(true);
    setSessionHint(false);
    expect(hadSession()).toBe(false);
  });

  it('treats blocked storage as no session instead of throwing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    });
    expect(() => setSessionHint(true)).not.toThrow();
    expect(hadSession()).toBe(false);
  });
});
