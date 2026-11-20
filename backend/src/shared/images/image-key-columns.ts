import type { PublicImageFeature } from './image-policy.js';

/**
 * Every database column that holds the key of an object in the PUBLIC media bucket: the one place that answers "which
 * stored objects does the application still reference?".
 *
 * Nothing deletes an object today (the storage port has only `put` and `exists`), so this list is not used at run
 * time. It exists so that the day an orphan cleanup is written (see "Cleaning up later" in docs/media.md) it starts
 * from a complete, reviewed list instead of rediscovering the columns, and so that adding an image column without
 * registering it here fails a test (tests/integration/database/image-key-columns.test.ts) rather than being found when
 * an object that something still shows has been deleted.
 *
 * Rules for an entry:
 * - the column holds a KEY (`onusfit/<feature>/<32 hex>.webp`, or a legacy `notifications/<hex>.jpg|png`), never a URL;
 * - every row counts as a reference, including soft-deleted ones: a soft-deleted record keeps its key and may be
 *   restored or audited, and a sent notification still shows its picture;
 * - `derivatives` names the objects stored beside the canonical image under a name computed from the key
 *   (`derivativeKey()`); they are referenced whenever the canonical key is, and have no column of their own;
 * - a column that belongs to private member media (avatars, progress photos) is NOT listed here: that media lives in
 *   a different bucket and needs its own registry and deletion queue.
 */
export interface ImageKeyColumn {
  table: string;
  column: string;
  /** The folder the column's keys live in. Legacy notification keys (`notifications/...`) are the one exception. */
  feature: PublicImageFeature;
  /** Objects stored beside each canonical image (`onusfit/<feature>/<hex>.<name>.<ext>`), by derivative name. */
  derivatives: readonly 'push'[];
}

export const IMAGE_KEY_COLUMNS: readonly ImageKeyColumn[] = [
  { table: 'notification_campaigns', column: 'image_key', feature: 'notifications', derivatives: ['push'] },
  { table: 'exercises', column: 'image_key', feature: 'exercises', derivatives: [] },
  { table: 'workouts', column: 'cover_image_key', feature: 'workouts', derivatives: [] },
];

/**
 * Whether a column NAME looks like it stores a media object key. The registry test applies this to every column in the
 * database and fails for one that matches but is not registered, which is what catches a new image column being added
 * without the registry (and so, later, the cleanup) knowing about it.
 *
 * Deliberately about names ending in `_key`: `image_url` columns hold an external address an admin typed, not an
 * object in this bucket, and are not storage references.
 */
export const LOOKS_LIKE_IMAGE_KEY_COLUMN =
  /(image|cover|photo|avatar|banner|thumbnail|artwork|picture|media)\w*_keys?$/;
