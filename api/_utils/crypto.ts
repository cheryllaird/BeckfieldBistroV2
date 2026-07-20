import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

// AES-256-GCM at-rest encryption for user-supplied secrets (e.g. Gemini API
// keys) stored in Firestore. The key never leaves this server — Firestore
// only ever holds ciphertext, so a Firestore export or console read exposes
// nothing usable without API_KEY_ENCRYPTION_SECRET.
const ALGORITHM = 'aes-256-gcm';

export interface EncryptedValue {
  iv: string;
  tag: string;
  ciphertext: string;
}

function getKey(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!secret) throw new Error('API_KEY_ENCRYPTION_SECRET env var is not set');
  const key = Buffer.from(secret, 'base64');
  if (key.length !== 32) {
    throw new Error('API_KEY_ENCRYPTION_SECRET must be a base64-encoded 32-byte key');
  }
  return key;
}

export function encryptSecret(plaintext: string): EncryptedValue {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export function decryptSecret(value: EncryptedValue): string {
  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(value.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
