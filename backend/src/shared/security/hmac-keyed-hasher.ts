import { createHmac, timingSafeEqual } from 'node:crypto';
import type { KeyedHasher } from './keyed-hasher.js';

export class HmacKeyedHasher implements KeyedHasher {
  constructor(private readonly secret: string) {}

  digest(value: string): string {
    return createHmac('sha256', this.secret).update(value, 'utf8').digest('base64url');
  }

  matches(value: string, digest: string): boolean {
    const actual = Buffer.from(this.digest(value));
    const expected = Buffer.from(digest);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
