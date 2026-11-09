import crypto from 'node:crypto';

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/**
 * Derives a consistent 32-byte key from any secret string using SHA-256.
 */
function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

/**
 * Encrypts a sensitive string using AES-256-GCM.
 * Never stores the encryption key in the database.
 */
export function encryptSecret(plainText: string, encryptionKey: string): EncryptedPayload {
  if (!plainText) {
    throw new Error('Cannot encrypt empty secret');
  }
  const key = deriveKey(encryptionKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let ciphertext = cipher.update(plainText, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');

  return {
    ciphertext,
    iv: iv.toString('hex'),
    authTag,
  };
}

/**
 * Decrypts an AES-256-GCM encrypted payload.
 * Verifies authenticity before returning plaintext.
 */
export function decryptSecret(
  payload: EncryptedPayload | string,
  encryptionKey: string
): string {
  const key = deriveKey(encryptionKey);
  const obj: EncryptedPayload =
    typeof payload === 'string' ? JSON.parse(payload) : payload;

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(obj.iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(obj.authTag, 'hex'));

  let plain = decipher.update(obj.ciphertext, 'hex', 'utf8');
  plain += decipher.final('utf8');

  return plain;
}

/**
 * Masks an API key for safe UI display and audit logging without leaking the secret.
 * Example: 'AIzaSyDuN92J438_4xQ9' -> 'AIzaSy...4xQ9'
 */
export function maskApiKey(apiKey?: string | null): string {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    return 'Not Configured';
  }
  const clean = apiKey.trim();
  if (clean.length <= 10) {
    return '***';
  }
  const prefix = clean.slice(0, 6);
  const suffix = clean.slice(-4);
  return `${prefix}...${suffix}`;
}
