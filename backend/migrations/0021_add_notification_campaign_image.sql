-- Migration 0021: optional image on a notification campaign (Android "big picture" push).
--
-- Additive and backward compatible: one nullable column, no default, no backfill. Every existing campaign keeps
-- image_key = NULL and behaves exactly as before (text only). Adding a nullable column without a default is a
-- metadata-only change, so it does not rewrite the table. Code from before this migration ignores the column.
--
-- What is stored is the OBJECT KEY in the public media bucket, never a URL. The public URL is derived at read time
-- from the configured media domain (R2_PUBLIC_BASE_URL), so the domain can change without touching rows and an
-- arbitrary external address can never be stored here. The CHECK mirrors the key format the upload endpoint
-- generates (128 random bits, hex), so even a hand-edited row cannot point outside notifications/.
ALTER TABLE notification_campaigns
  ADD COLUMN image_key text,
  ADD CONSTRAINT notification_campaigns_image_key_valid CHECK (
    image_key IS NULL OR image_key ~ '^notifications/[0-9a-f]{32}\.(jpg|png)$'
  );
