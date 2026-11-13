import { randomBytes, randomInt, randomUUID } from 'node:crypto';

/** Uniform, CSPRNG-backed numeric code with leading zeros preserved (e.g. "004217"). */
export const randomOtp = (digits = 6): string =>
  randomInt(0, 10 ** digits)
    .toString()
    .padStart(digits, '0');

/** URL-safe random secret; 32 bytes = 256 bits of entropy. */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

export const randomId = (): string => randomUUID();
