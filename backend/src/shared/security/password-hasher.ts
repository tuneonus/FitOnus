/** Port for password hashing. Application code depends on this, never on argon2 directly. */
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  /** Returns false for a wrong password or a malformed hash; never throws for bad input. */
  verify(hash: string, plain: string): Promise<boolean>;
  needsRehash(hash: string): boolean;
}
