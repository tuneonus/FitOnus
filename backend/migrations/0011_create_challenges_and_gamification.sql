-- Migration 0011: Create Challenges and Gamification System
-- Phase 7: Challenges, Occurrences, Badges, Enrollments, Points Ledger, and Gamification Profiles

-- 1. Badges Catalog Table
-- Static and unlocked achievement badges across tiers and categories
CREATE TABLE badges (
  id                  uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                varchar(100)   NOT NULL UNIQUE,
  name                varchar(120)   NOT NULL,
  description         text           NOT NULL,
  category            varchar(30)    NOT NULL CHECK (category IN ('workout', 'streak', 'nutrition', 'strength', 'milestone', 'challenge')),
  tier                varchar(20)    NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum', 'special')),
  icon_name           varchar(50)    NOT NULL DEFAULT 'medal',
  points_value        integer        NOT NULL DEFAULT 50 CHECK (points_value >= 0),
  unlock_condition    jsonb          NOT NULL DEFAULT '{}'::jsonb,
  is_active           boolean        NOT NULL DEFAULT true,
  created_at          timestamptz    NOT NULL DEFAULT now(),
  updated_at          timestamptz    NOT NULL DEFAULT now()
);

CREATE INDEX idx_badges_category_tier ON badges (category, tier) WHERE is_active = true;

-- 2. Challenges Table
-- Definitions of challenges (cadence, metric target, points, and badge reward)
CREATE TABLE challenges (
  id                  uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                varchar(100)   NOT NULL UNIQUE,
  title               varchar(150)   NOT NULL,
  description         text           NOT NULL,
  cadence             varchar(20)    NOT NULL CHECK (cadence IN ('daily', 'weekly', 'monthly', 'special', 'custom')),
  category            varchar(30)    NOT NULL CHECK (category IN ('workout', 'habit', 'nutrition', 'hydration', 'mixed')),
  metric_type         varchar(40)    NOT NULL CHECK (metric_type IN (
                        'workout_count', 'workout_duration_min', 'workout_volume_kg',
                        'habit_completion_count', 'habit_streak_days',
                        'water_liters', 'calorie_compliance_days', 'protein_target_days',
                        'personal_record_count'
                      )),
  target_value        numeric(10, 2) NOT NULL CHECK (target_value > 0),
  reward_points       integer        NOT NULL DEFAULT 0 CHECK (reward_points >= 0),
  reward_badge_id     uuid           REFERENCES badges (id) ON DELETE SET NULL,
  status              varchar(20)    NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  auto_enroll         boolean        NOT NULL DEFAULT true,
  icon_name           varchar(50)    NOT NULL DEFAULT 'trophy',
  banner_color        varchar(30)    NOT NULL DEFAULT 'teal',
  metadata            jsonb          NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz    NOT NULL DEFAULT now(),
  updated_at          timestamptz    NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

CREATE INDEX idx_challenges_cadence_status ON challenges (cadence, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_challenges_metric_type ON challenges (metric_type) WHERE deleted_at IS NULL;

-- 3. Challenge Occurrences Table
-- Distinct time-bound instances of a recurring challenge (e.g. Day 2026-11-06 or Week 2026-W45)
CREATE TABLE challenge_occurrences (
  id                  uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id        uuid           NOT NULL REFERENCES challenges (id) ON DELETE CASCADE,
  occurrence_key      varchar(100)   NOT NULL,
  period_start        timestamptz    NOT NULL,
  period_end          timestamptz    NOT NULL,
  status              varchar(20)    NOT NULL DEFAULT 'active' CHECK (status IN ('upcoming', 'active', 'evaluating', 'closed', 'archived')),
  created_at          timestamptz    NOT NULL DEFAULT now(),
  updated_at          timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT chk_occurrence_period CHECK (period_end > period_start),
  CONSTRAINT uq_occurrence_challenge_start UNIQUE (challenge_id, period_start),
  CONSTRAINT uq_occurrence_challenge_key UNIQUE (challenge_id, occurrence_key)
);

CREATE INDEX idx_challenge_occurrences_challenge_dates ON challenge_occurrences (challenge_id, period_start DESC, period_end DESC);
CREATE INDEX idx_challenge_occurrences_status ON challenge_occurrences (status, period_end DESC);

-- 4. Challenge Enrollments Table
-- Tracks a user's participation, progress, and reward claim for a specific challenge occurrence
CREATE TABLE challenge_enrollments (
  id                  uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  occurrence_id       uuid           NOT NULL REFERENCES challenge_occurrences (id) ON DELETE CASCADE,
  challenge_id        uuid           NOT NULL REFERENCES challenges (id) ON DELETE CASCADE,
  status              varchar(20)    NOT NULL DEFAULT 'in_progress' CHECK (status IN ('joined', 'in_progress', 'completed', 'claimed', 'expired')),
  current_progress    numeric(10, 2) NOT NULL DEFAULT 0 CHECK (current_progress >= 0),
  target_value        numeric(10, 2) NOT NULL CHECK (target_value > 0),
  completed_at        timestamptz,
  claimed_at          timestamptz,
  last_evaluated_at   timestamptz    NOT NULL DEFAULT now(),
  created_at          timestamptz    NOT NULL DEFAULT now(),
  updated_at          timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT uq_enrollment_user_occurrence UNIQUE (user_id, occurrence_id)
);

CREATE INDEX idx_enrollments_user_status ON challenge_enrollments (user_id, status);
CREATE INDEX idx_enrollments_occurrence ON challenge_enrollments (occurrence_id);
CREATE INDEX idx_enrollments_challenge_user ON challenge_enrollments (challenge_id, user_id);

-- 5. User Badges Table
-- Badges unlocked by users (strictly idempotent per user + badge)
CREATE TABLE user_badges (
  id                  uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  badge_id            uuid           NOT NULL REFERENCES badges (id) ON DELETE CASCADE,
  earned_at           timestamptz    NOT NULL DEFAULT now(),
  trigger_type        varchar(40)    NOT NULL CHECK (trigger_type IN ('challenge', 'milestone', 'streak', 'pr', 'admin')),
  trigger_id          varchar(100),
  metadata            jsonb          NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT uq_user_badge UNIQUE (user_id, badge_id)
);

CREATE INDEX idx_user_badges_user_earned ON user_badges (user_id, earned_at DESC);

-- 6. Gamification Profiles Table
-- Aggregated user gamification stats (total points, current level, badges won, challenges won)
CREATE TABLE gamification_profiles (
  user_id             uuid           PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  total_points        integer        NOT NULL DEFAULT 0 CHECK (total_points >= 0),
  current_level       integer        NOT NULL DEFAULT 1 CHECK (current_level >= 1),
  badges_count        integer        NOT NULL DEFAULT 0 CHECK (badges_count >= 0),
  challenges_won      integer        NOT NULL DEFAULT 0 CHECK (challenges_won >= 0),
  updated_at          timestamptz    NOT NULL DEFAULT now()
);

-- 7. Gamification Points Ledger Table
-- Append-only transaction ledger guaranteeing idempotent point allocations
CREATE TABLE gamification_points_ledger (
  id                  uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  points              integer        NOT NULL CHECK (points > 0),
  source_type         varchar(40)    NOT NULL CHECK (source_type IN ('challenge', 'badge', 'habit_streak', 'workout_milestone', 'admin_adjustment')),
  source_id           varchar(100)   NOT NULL,
  description         varchar(200)   NOT NULL,
  created_at          timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_point_source UNIQUE (user_id, source_type, source_id)
);

CREATE INDEX idx_gamification_ledger_user ON gamification_points_ledger (user_id, created_at DESC);

-- 8. Seed Initial Badges
-- Foundational badges matching legacy achievements and core gamification milestones
INSERT INTO badges (slug, name, description, category, tier, icon_name, points_value, unlock_condition)
VALUES
  ('strength_pr_first', 'First PR Broken', 'Achieved your first personal strength record', 'strength', 'bronze', 'trophy', 50, '{"type": "pr_count", "threshold": 1}'::jsonb),
  ('workout_consistency_16', 'Consistency Champion', 'Completed 16 workouts in a single month', 'workout', 'silver', 'flame', 100, '{"type": "monthly_workout_count", "threshold": 16}'::jsonb),
  ('weight_loss_10kg', '10 kg Down', 'Reaching a transformative 10 kg weight milestone', 'milestone', 'gold', 'medal', 150, '{"type": "weight_loss_kg", "threshold": 10.0}'::jsonb),
  ('habit_streak_7', 'Unstoppable 7', 'Maintained a 7-day habit streak', 'streak', 'bronze', 'zap', 50, '{"type": "habit_streak_days", "threshold": 7}'::jsonb),
  ('habit_streak_30', 'Habit Master 30', 'Completed a 30-day continuous habit streak', 'streak', 'gold', 'sparkles', 200, '{"type": "habit_streak_days", "threshold": 30}'::jsonb),
  ('workout_century_100', 'Century Club', 'Completed 100 total workout sessions', 'workout', 'platinum', 'crown', 500, '{"type": "total_workouts", "threshold": 100}'::jsonb),
  ('hydration_hero', 'Hydration Hero', 'Met your daily hydration target 7 days in a row', 'nutrition', 'silver', 'droplet', 100, '{"type": "hydration_streak_days", "threshold": 7}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

