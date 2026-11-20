/**
 * The storage the public media bucket is used through. Every feature that stores a public image (notifications,
 * exercises) depends on this small port, never on R2 itself, so tests inject an in-memory fake and no test can reach
 * real storage.
 *
 * Deliberately only `put` and `exists`: nothing in this codebase deletes or lists objects yet. Deleting needs a rule
 * for "is this object still referenced?" first (see docs/media.md), and until that exists an object is never removed.
 */
export interface PublicObjectStore {
  put(object: { key: string; body: Uint8Array; contentType: string; cacheControl?: string }): Promise<void>;
  /** False when the object does not exist. Throws when that cannot be determined. */
  exists(key: string): Promise<boolean>;
}
