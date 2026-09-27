import { randomBytes } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptSecret, encryptSecret } from './crypto';

describe('encryptSecret / decryptSecret', () => {
  beforeEach(() => {
    vi.stubEnv('API_KEY_ENCRYPTION_SECRET', randomBytes(32).toString('base64'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('round-trips a secret', () => {
    const encrypted = encryptSecret('AIza-test-key');
    expect(decryptSecret(encrypted)).toBe('AIza-test-key');
  });

  it('never stores the plaintext', () => {
    const encrypted = encryptSecret('AIza-test-key');
    expect(JSON.stringify(encrypted)).not.toContain('AIza-test-key');
  });

  it('uses a fresh IV per encryption', () => {
    const a = encryptSecret('same');
    const b = encryptSecret('same');
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('rejects tampered ciphertext', () => {
    const encrypted = encryptSecret('secret');
    const bytes = Buffer.from(encrypted.ciphertext, 'base64');
    bytes[0] ^= 0xff;
    expect(() => decryptSecret({ ...encrypted, ciphertext: bytes.toString('base64') })).toThrow();
  });

  it('cannot be decrypted with a different key', () => {
    const encrypted = encryptSecret('secret');
    vi.stubEnv('API_KEY_ENCRYPTION_SECRET', randomBytes(32).toString('base64'));
    expect(() => decryptSecret(encrypted)).toThrow();
  });

  it('fails loudly when the key is missing', () => {
    vi.stubEnv('API_KEY_ENCRYPTION_SECRET', '');
    expect(() => encryptSecret('secret')).toThrow(/not set/);
  });

  it('fails loudly when the key is the wrong length', () => {
    vi.stubEnv('API_KEY_ENCRYPTION_SECRET', randomBytes(16).toString('base64'));
    expect(() => encryptSecret('secret')).toThrow(/32-byte/);
  });
});
