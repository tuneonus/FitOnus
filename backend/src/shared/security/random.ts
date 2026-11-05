import { randomBytes, randomUUID } from 'node:crypto';

/** URL-safe random secret; 32 bytes = 256 bits of entropy. */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

export const randomId = (): string => randomUUID();
