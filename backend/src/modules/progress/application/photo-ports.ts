import type { NewProgressPhoto, ProgressPhotoRecord } from '../domain/progress-photo.js';

/**
 * Every method is scoped to one user id taken from the authenticated session. A photo is found by (id, user id) in
 * one query, so another member's photo id behaves exactly like an id that does not exist: nothing is revealed.
 */
export interface ProgressPhotoRepository {
  count(userId: string): Promise<number>;
  /** Throws `ProgressPhotoLimitReachedError` when the member already holds the maximum (the database decides). */
  insert(userId: string, photo: NewProgressPhoto): Promise<ProgressPhotoRecord>;
  /** The member's photos, newest day first (then newest upload first). At most the limit, so no paging is needed. */
  list(userId: string): Promise<ProgressPhotoRecord[]>;
  find(userId: string, id: string): Promise<ProgressPhotoRecord | null>;
  /** A real delete. The database queues the stored objects for removal in the same statement (migration 0027). */
  delete(userId: string, id: string): Promise<boolean>;
}
