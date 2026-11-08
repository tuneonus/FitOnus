-- Migration 0012: Extend User Settings and Preferences
-- Phase 9: Settings & Preferences — language, privacy toggles, and notification schedule
--
-- This is a safe, additive migration. All new columns carry explicit DEFAULT values
-- so zero existing rows are broken. No data is deleted or transformed.
--
-- Privacy defaults follow explicit opt-in policy:
--   privacy_analytics       DEFAULT true   (aggregate, anonymised usage data)
--   privacy_photo_retention DEFAULT true   (retaining uploaded progress photos)
--   privacy_coach_sharing   DEFAULT false  (explicit opt-in — not shared with coaches by default)
--
-- Language support: 'en' (English) and 'ta' (Tamil).
-- Tamil UI translation is NOT yet available; the value is stored for future use.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS language               text    NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS privacy_analytics      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS privacy_photo_retention boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS privacy_coach_sharing  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_schedule  jsonb   NOT NULL DEFAULT '{}';

-- Add language constraint separately so the IF NOT EXISTS above works cleanly
ALTER TABLE user_settings
  DROP CONSTRAINT IF EXISTS user_settings_language_valid;

ALTER TABLE user_settings
  ADD CONSTRAINT user_settings_language_valid
    CHECK (language IN ('en', 'ta'));
