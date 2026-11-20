-- Migration 0023: optional uploaded image for an exercise.
--
-- Additive and backward compatible: one nullable column, no default, no backfill, no index. Every existing exercise
-- keeps image_key = NULL and keeps showing its image_url exactly as before; image_url and video_url are not touched.
-- Adding a nullable column without a default is a metadata-only change, so it does not rewrite the table. Code from
-- before this migration ignores the column.
--
-- What is stored is the OBJECT KEY in the public media bucket, never a URL. The public URL is derived at read time
-- from the configured media domain (R2_PUBLIC_BASE_URL), so the domain can change without touching rows and an
-- arbitrary external address can never be stored here (external images stay in image_url). The CHECK mirrors the key
-- the upload endpoint generates (onusfit/exercises/ plus 128 random bits, hex, as a WebP), so even a hand-edited row
-- cannot point outside onusfit/exercises/. An uploaded image takes precedence over image_url when both are present.
--
-- Deliberately not unique: an object may be shared by nothing today, but nothing in the data model needs to forbid it,
-- and a uniqueness error on a retried save would add a failure mode for no benefit. Which objects are still
-- referenced is answered by reading this column, not by a constraint.
ALTER TABLE exercises
  ADD COLUMN image_key text,
  ADD CONSTRAINT exercises_image_key_valid CHECK (
    image_key IS NULL OR image_key ~ '^onusfit/exercises/[0-9a-f]{32}\.webp$'
  );
