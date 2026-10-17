import { describe, expect, it } from 'vitest';
import { legalPathOf } from './pages';

describe('legalPathOf', () => {
  it('recognises the legal pages, with or without a trailing slash', () => {
    expect(legalPathOf('/terms')).toBe('/terms');
    expect(legalPathOf('/privacy/')).toBe('/privacy');
    expect(legalPathOf('/copyright')).toBe('/copyright');
  });

  it('ignores every other path', () => {
    expect(legalPathOf('/')).toBeNull();
    expect(legalPathOf('/recipes')).toBeNull();
    expect(legalPathOf('/terms/extra')).toBeNull();
  });
});
