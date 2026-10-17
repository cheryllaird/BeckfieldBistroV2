import { describe, expect, it } from 'vitest';
import { legalLive, needsTermsAcceptance } from './legal';

const live = {
  termsVersion: '2026-11-01',
  termsUrl: 'https://example.com/terms',
  privacyUrl: 'https://example.com/privacy',
  copyrightUrl: 'https://example.com/copyright',
};
const off = { ...live, termsVersion: '' };

describe('legalLive', () => {
  it('needs a version and both page links', () => {
    expect(legalLive(live)).toBe(true);
    expect(legalLive(off)).toBe(false);
    expect(legalLive({ ...live, privacyUrl: '' })).toBe(false);
  });
});

describe('needsTermsAcceptance', () => {
  it('asks a user who has never accepted', () => {
    expect(needsTermsAcceptance(null, live)).toBe(true);
  });

  it('asks again when the version changes', () => {
    expect(needsTermsAcceptance('2026-01-01', live)).toBe(true);
  });

  it('lets through a user who accepted this version', () => {
    expect(needsTermsAcceptance('2026-11-01', live)).toBe(false);
  });

  it('never blocks before the profile has loaded', () => {
    expect(needsTermsAcceptance(undefined, live)).toBe(false);
  });

  it('is off until the legal pages are live', () => {
    expect(needsTermsAcceptance(null, off)).toBe(false);
  });
});
