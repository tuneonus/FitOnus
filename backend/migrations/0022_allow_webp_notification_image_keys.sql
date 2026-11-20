-- Migration 0022: notification image keys may also use the canonical image-storage key shape.
--
-- Migration 0021 pinned notification_campaigns.image_key to the keys written before the image storage policy
-- (notifications/<32 hex>.jpg|png). The policy stores every image as an optimized WebP under a per-feature prefix:
-- onusfit/notifications/<32 hex>.webp. This widens the CHECK to accept BOTH shapes, so nothing already stored becomes
-- invalid and no row is rewritten: existing campaigns keep their legacy keys (and the public URLs built from them),
-- new ones get the canonical shape.
--
-- Still only ever a key, never a URL: the pattern is anchored and has no room for a scheme, host, query or path
-- traversal. Metadata-only apart from re-checking the (few) existing rows; 0021 must have been applied first.
ALTER TABLE notification_campaigns
  DROP CONSTRAINT notification_campaigns_image_key_valid,
  ADD CONSTRAINT notification_campaigns_image_key_valid CHECK (
    image_key IS NULL
    OR image_key ~ '^(notifications/[0-9a-f]{32}\.(jpg|png)|onusfit/notifications/[0-9a-f]{32}\.webp)$'
  );
