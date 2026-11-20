-- Migration 0027: a member's progress photos (private).
--
-- Additive: one new table, nothing existing is touched.
--
-- What is stored is the OBJECT KEY in the PRIVATE bucket, never a URL (see 0026). Many rows per user, at most 50.
--
-- Deleting a photo is a real delete (not a soft delete): a "deleted" private photo that stays in storage would
-- contradict the member's choice. The trigger queues the picture and its thumbnail for removal in the same
-- transaction (see 0025), and deleting the user cascades here and queues all of theirs.
--
-- The limit of 50 per member is enforced here, in the database, so no code path can exceed it: the trigger takes a
-- per-member advisory lock for the transaction, so two uploads racing at 49 photos cannot both succeed, and counts
-- under that lock. The application checks first for a friendly early answer; this is the authority. Keep the number in
-- step with PROGRESS_PHOTO_LIMIT in src/modules/progress/domain/progress-photo.ts (a test pins both).
CREATE TABLE progress_photos (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  object_key text        NOT NULL,
  -- The day the photo was taken (the member's own calendar day), which orders the gallery.
  taken_on   date        NOT NULL,
  tag        text,
  width      integer     NOT NULL,
  height     integer     NOT NULL,
  byte_size  integer     NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT progress_photos_object_key_unique UNIQUE (object_key),
  CONSTRAINT progress_photos_object_key_valid CHECK (
    object_key ~ ('^members/' || user_id::text || '/progress/[0-9a-f]{32}\.webp$')
  ),
  CONSTRAINT progress_photos_tag_valid CHECK (tag IS NULL OR tag IN ('front', 'side', 'back', 'other')),
  CONSTRAINT progress_photos_taken_on_sane CHECK (taken_on >= DATE '2000-01-01'),
  CONSTRAINT progress_photos_size_positive CHECK (width > 0 AND height > 0 AND byte_size > 0)
);

-- The gallery: one member's photos, newest day first.
CREATE INDEX progress_photos_user_gallery_idx ON progress_photos (user_id, taken_on DESC, created_at DESC, id);

CREATE FUNCTION progress_photos_enforce_limit() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('progress_photos:' || NEW.user_id::text, 0));
  IF (SELECT count(*) FROM progress_photos WHERE user_id = NEW.user_id) >= 50 THEN
    RAISE EXCEPTION 'A member can keep at most 50 progress photos'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'progress_photos_user_limit';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER progress_photos_limit
  BEFORE INSERT ON progress_photos
  FOR EACH ROW EXECUTE FUNCTION progress_photos_enforce_limit();

CREATE TRIGGER progress_photos_queue_object
  AFTER DELETE ON progress_photos
  FOR EACH ROW EXECUTE FUNCTION private_media_queue_old_key();
