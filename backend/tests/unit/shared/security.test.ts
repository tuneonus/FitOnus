import { describe, expect, it } from 'vitest';
import { Argon2PasswordHasher } from '../../../src/shared/security/argon2-password-hasher.js';
import { HmacKeyedHasher } from '../../../src/shared/security/hmac-keyed-hasher.js';
import { assertPasswordPolicy } from '../../../src/shared/security/password-policy.js';
import { randomToken } from '../../../src/shared/security/random.js';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('produces argon2id hashes that verify only the original password', async () => {
    const hash = await hasher.hash('a long enough passphrase');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(hasher.verify(hash, 'a long enough passphrase')).resolves.toBe(true);
    await expect(hasher.verify(hash, 'a wrong passphrase')).resolves.toBe(false);
    expect(hasher.needsRehash(hash)).toBe(false);
  });

  it('treats malformed hashes as a failed verification, not an exception', async () => {
    await expect(hasher.verify('not-a-hash', 'whatever')).resolves.toBe(false);
    expect(hasher.needsRehash('not-a-hash')).toBe(true);
  });
});

describe('HmacKeyedHasher', () => {
  it('is deterministic per key and compares in constant time', () => {
    const a = new HmacKeyedHasher('k'.repeat(32));
    const b = new HmacKeyedHasher('j'.repeat(32));
    expect(a.digest('value')).toBe(a.digest('value'));
    expect(a.digest('value')).not.toBe(b.digest('value'));
    expect(a.matches('value', a.digest('value'))).toBe(true);
    expect(a.matches('value', b.digest('value'))).toBe(false);
    expect(a.matches('value', 'short')).toBe(false);
  });
});

describe('password policy and random tokens', () => {
  it('enforces length, not composition', () => {
    expect(() => assertPasswordPolicy('short')).toThrow(
      expect.objectContaining({ code: 'PASSWORD_POLICY_VIOLATION' }),
    );
    expect(() => assertPasswordPolicy(' '.repeat(20))).toThrow();
    expect(() => assertPasswordPolicy('x'.repeat(129))).toThrow();
    expect(() => assertPasswordPolicy('all lowercase words are fine')).not.toThrow();
  });

  it('generates 256-bit url-safe tokens', () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(token);
  });
});
