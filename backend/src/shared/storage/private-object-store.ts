/**
 * The storage member photos are kept in: a PRIVATE bucket with no public access and no public domain.
 *
 * Deliberately a separate port from `PublicObjectStore` (object-store.ts), not an extension of it:
 * - the public port has no `delete` on purpose, and a private store must never be usable where a public one is
 *   expected, nor the other way round, so that nothing can delete shared public media through this code;
 * - reading is never by public URL: `presignGet` hands out a short-lived signed URL, and it is the only way a picture
 *   leaves the bucket.
 *
 * Tests inject an in-memory fake (tests/helpers/fake-private-store.ts), so no test can reach real storage.
 */
export interface SignedObjectUrl {
  url: string;
  expiresAt: Date;
}

export interface PrivateObjectStore {
  put(object: { key: string; body: Uint8Array; contentType: string; cacheControl?: string }): Promise<void>;
  /** False when the object does not exist. Throws when that cannot be determined. */
  exists(key: string): Promise<boolean>;
  /** Idempotent: deleting an object that is already gone succeeds. */
  delete(key: string): Promise<void>;
  /** A GET-only URL that works until `expiresAt` and for this one object only. Pure: no network call. */
  presignGet(key: string, options: { expiresInSeconds: number }): SignedObjectUrl;
}

export type PrivateStorageOperation = 'put' | 'head' | 'delete';
export type PrivateStorageFailureReason = 'http' | 'timeout' | 'network';

/**
 * A private-storage call failed. Carries only the operation, the HTTP status and a coarse reason: the response body,
 * the request URL (a signed URL is a credential) and every header are deliberately left out, so an error can be
 * logged and stored in the deletion queue without leaking anything.
 */
export class PrivateStorageError extends Error {
  override readonly name = 'PrivateStorageError';
  constructor(
    readonly operation: PrivateStorageOperation,
    readonly reason: PrivateStorageFailureReason,
    readonly status: number | null,
  ) {
    super(`Private storage ${operation} failed (${reason}${status === null ? '' : ` HTTP ${status}`})`);
  }
}
