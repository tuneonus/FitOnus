-- Migration 0028: per-member nutrition settings, starting with the daily water target.
--
-- Additive: one new table, nothing existing is touched. It takes the next version because the repository requires
-- contiguous migration numbers (see the image-migrations-upgrade test); a nutrition provenance migration has no file
-- yet, so it becomes 0029 or later.
--
-- Why a table of its own and not a column on user_profiles: a member can set a water target before (or without)
-- completing onboarding, and a target change is not a profile edit (no profile version bump, no onboarding rules).
-- The row is optional: a member with no row has no saved target and gets the estimate from their weight (35 ml per kg,
-- worked out in the application, never stored), so nothing here has to be backfilled.
--
-- water_target_ml NULL means "use the estimate"; the range matches the API (500-8000 ml) so the database refuses any
-- value the application would.
CREATE TABLE user_nutrition_settings (
  user_id         uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  water_target_ml integer,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_nutrition_settings_water_target_valid CHECK (
    water_target_ml IS NULL OR (water_target_ml >= 500 AND water_target_ml <= 8000)
  )
);
