-- Migration 0026: a member's profile picture (private).
--
-- Additive: one new table, nothing existing is touched. Every existing user simply has no row, which is "no avatar",
-- exactly as before; users itself is not altered.
--
-- What is stored is the OBJECT KEY in the PRIVATE bucket, never a URL: a picture is shown only through a short-lived
-- signed URL that the backend issues after checking whose picture it is. One row per user (user_id is the key).
--
-- The CHECK makes the database itself refuse a key that is not this user's own avatar key, so even a hand-edited row
-- cannot point at someone else's picture or at anything outside members/<this user>/avatar/. UNIQUE keeps one object
-- from being shared by two rows.
--
-- Replacing or removing the avatar changes object_key / deletes the row, and the trigger queues the old picture and
-- its thumbnail for deletion in the same transaction (see 0025). Deleting the user cascades here and queues too.
CREATE TABLE member_avatars (
  user_id    uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  object_key text        NOT NULL,
  width      integer     NOT NULL,
  height     integer     NOT NULL,
  byte_size  integer     NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT member_avatars_object_key_unique UNIQUE (object_key),
  CONSTRAINT member_avatars_object_key_valid CHECK (
    object_key ~ ('^members/' || user_id::text || '/avatar/[0-9a-f]{32}\.webp$')
  ),
  CONSTRAINT member_avatars_size_positive CHECK (width > 0 AND height > 0 AND byte_size > 0)
);

CREATE TRIGGER member_avatars_queue_old_object
  AFTER DELETE OR UPDATE OF object_key ON member_avatars
  FOR EACH ROW EXECUTE FUNCTION private_media_queue_old_key();
