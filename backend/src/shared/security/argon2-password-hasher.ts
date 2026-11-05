import argon2 from 'argon2';
import type { PasswordHasher } from './password-hasher.js';

/** OWASP-recommended Argon2id baseline (19 MiB, 2 iterations, 1 lane). Raise as hardware allows. */
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export class Argon2PasswordHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, OPTIONS);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  needsRehash(hash: string): boolean {
    try {
      return argon2.needsRehash(hash, OPTIONS);
    } catch {
      return true;
    }
  }
}
