-- Migration: 0014_create_app_settings.sql
-- Description: Creates app_settings for remote admin configuration and user_ai_usage for persistent daily quotas.

CREATE TABLE IF NOT EXISTS app_settings (
  key         text        PRIMARY KEY,
  value       jsonb       NOT NULL,
  category    text        NOT NULL,
  description text,
  updated_by  uuid        REFERENCES users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  version     integer     NOT NULL DEFAULT 1,

  CONSTRAINT app_settings_key_length CHECK (char_length(key) BETWEEN 1 AND 100),
  CONSTRAINT app_settings_category_length CHECK (char_length(category) BETWEEN 1 AND 50),
  CONSTRAINT app_settings_version_positive CHECK (version >= 1)
);

CREATE INDEX IF NOT EXISTS idx_app_settings_category ON app_settings (category);

-- Per-user daily AI quota tracking for concurrent safety and transparent usage accounting
CREATE TABLE IF NOT EXISTS user_ai_usage (
  user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date    date        NOT NULL DEFAULT CURRENT_DATE,
  action_type   text        NOT NULL,
  request_count integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, usage_date, action_type),
  CONSTRAINT user_ai_usage_action_type_check CHECK (action_type IN ('coach_chat', 'meal_photo', 'voice_meal', 'workout_generator')),
  CONSTRAINT user_ai_usage_count_nonnegative CHECK (request_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_user_ai_usage_date_action ON user_ai_usage (usage_date, action_type);

-- Seed initial production-safe default application settings
INSERT INTO app_settings (key, value, category, description, version)
VALUES
  (
    'app.maintenance',
    '{"enabled": false, "message": "FitOnus is currently undergoing scheduled maintenance. Please check back shortly.", "expectedEndTime": null}'::jsonb,
    'app',
    'Maintenance mode control, blocking non-admin client traffic with optional end-time notice.',
    1
  ),
  (
    'app.min_version',
    '{"androidMinVersion": "1.0.0"}'::jsonb,
    'app',
    'Minimum supported client versions. Versions below this threshold are prompted or forced to update.',
    1
  ),
  (
    'app.force_update',
    '{"enabled": false, "updateMessage": "A new version of FitOnus is required to continue.", "storeUrl": ""}'::jsonb,
    'app',
    'Force update configuration directing out-of-date clients to verified store releases.',
    1
  ),
  (
    'app.support',
    '{"email": "", "website": "", "contactInfo": ""}'::jsonb,
    'app',
    'Official contact information for user support, inquiries, and customer care.',
    1
  ),
  (
    'app.legal',
    '{"privacyPolicyUrl": "", "termsOfServiceUrl": ""}'::jsonb,
    'app',
    'Verified legal URLs for privacy compliance and terms of service.',
    1
  ),
  (
    'features.flags',
    '{"aiCoach": true, "mealPhotoScanner": true, "voiceMealEntry": true, "workoutGenerator": true}'::jsonb,
    'features',
    'Global remote feature toggles enabling or disabling high-level mobile features.',
    1
  ),
  (
    'ai.limits',
    '{"dailyGlobalLimit": 50, "coachChatDailyLimit": 20, "mealPhotoDailyLimit": 10, "voiceMealDailyLimit": 10, "workoutGeneratorDailyLimit": 10}'::jsonb,
    'ai',
    'Per-user daily quota limits across AI-powered capabilities with explicit daily reset boundary.',
    1
  )
ON CONFLICT (key) DO NOTHING;
