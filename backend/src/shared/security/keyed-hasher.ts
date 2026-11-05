/**
 * Port for keyed (peppered) hashing of high-entropy values such as refresh tokens
 * and request fingerprints. A database leak alone is not enough to use the stored values.
 */
export interface KeyedHasher {
  digest(value: string): string;
  /** Constant-time comparison of `value` against a stored digest. */
  matches(value: string, digest: string): boolean;
}
