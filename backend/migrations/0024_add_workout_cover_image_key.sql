-- Migration 0024: optional cover image for a system workout template.
--
-- Additive and backward compatible: one nullable column, no default, no backfill, no index. Every existing workout
-- keeps cover_image_key = NULL and looks exactly as before. Adding a nullable column without a default is a
-- metadata-only change, so it does not rewrite the table. Code from before this migration ignores the column.
--
-- What is stored is the OBJECT KEY in the public media bucket, never a URL. The public URL is derived at read time
-- from the configured media domain (R2_PUBLIC_BASE_URL), so the domain can change without touching rows and an
-- arbitrary external address can never be stored here.
--
-- The CHECK does two things:
--   1. it mirrors the key the upload endpoint generates (onusfit/workouts/ plus 128 random bits, hex, as a WebP), so
--      even a hand-edited row cannot point outside onusfit/workouts/;
--   2. it only allows a cover on a SYSTEM TEMPLATE (is_template AND user_id IS NULL). The media bucket is public and
--      holds admin-authored artwork only: a member's own routine can never reference it, whatever the application
--      code does. Existing rows all have NULL here, so the constraint is satisfied without rewriting anything.
--
-- Deliberately not unique and not a foreign key: an object may be shared by nothing today, but nothing in the data
-- model needs to forbid it. Which objects are still referenced is answered by reading this column (see the image-key
-- registry in src/shared/images/image-key-columns.ts), not by a constraint.
ALTER TABLE workouts
  ADD COLUMN cover_image_key text,
  ADD CONSTRAINT workouts_cover_image_key_valid CHECK (
    cover_image_key IS NULL
    OR (
      cover_image_key ~ '^onusfit/workouts/[0-9a-f]{32}\.webp$'
      AND is_template = true
      AND user_id IS NULL
    )
  );
