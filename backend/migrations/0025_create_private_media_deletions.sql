-- Migration 0025: the durable queue of private member-photo objects that must be removed from the private bucket.
--
-- Additive: one new table and one trigger function, nothing existing is touched. Used by the member-photo features
-- (avatars 0026, progress photos 0027) and by nothing else.
--
-- Why a queue in the database: a member's rows disappear through cascades too (deleting an account removes every row
-- of theirs), and a cascade cannot call object storage. So the database itself records, in the SAME transaction as
-- the change that made an object unwanted, which objects to delete; a worker deletes them afterwards and retries until
-- storage accepts. A crash, an outage or a deploy in between loses nothing, because the row is still queued.
--
-- The CHECK admits only the private key shape (members/<owner uuid>/<avatar|progress>/<32 hex>[.thumb].webp), so
-- this table can never ask for a PUBLIC object (onusfit/..., notifications/...) to be deleted. There is deliberately
-- no foreign key to users: the row must outlive the account whose photo it is.
CREATE TABLE private_media_deletions (
  object_key      text        PRIMARY KEY,
  queued_at       timestamptz NOT NULL DEFAULT now(),
  attempts        integer     NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  -- A coarse reason only (operation and HTTP status); never a URL, header or response body.
  last_error      text,

  CONSTRAINT private_media_deletions_key_valid CHECK (
    object_key ~ '^members/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(avatar|progress)/[0-9a-f]{32}(\.thumb)?\.webp$'
  ),
  CONSTRAINT private_media_deletions_attempts_nonneg CHECK (attempts >= 0),
  CONSTRAINT private_media_deletions_error_length CHECK (last_error IS NULL OR char_length(last_error) <= 200)
);

CREATE INDEX private_media_deletions_due_idx ON private_media_deletions (next_attempt_at);

-- Row trigger shared by the member-photo tables. When a row is deleted, or its object_key is replaced, the OLD picture
-- and its thumbnail (<same name>.thumb.webp) are queued. Cascades from users fire it too, which is what makes account
-- deletion leave no private object behind.
CREATE FUNCTION private_media_queue_old_key() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.object_key IS NOT DISTINCT FROM NEW.object_key THEN
    RETURN NULL;
  END IF;
  INSERT INTO private_media_deletions (object_key)
  VALUES (OLD.object_key), (left(OLD.object_key, length(OLD.object_key) - 5) || '.thumb.webp')
  ON CONFLICT (object_key) DO NOTHING;
  RETURN NULL;
END;
$$;
