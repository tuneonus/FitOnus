-- Migration 0018: Notification system (devices, preferences, campaigns, inbox, deliveries).
--
-- Additive only: no existing table is altered. The master push switch is the existing
-- user_settings.notifications_enabled column; this migration only adds per-category preferences.

-- One row per (user, app installation). The FCM token rotates in place; a token can belong to exactly one
-- row, so signing in on a device that another account used moves the token instead of duplicating it.
CREATE TABLE user_push_devices (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  installation_id     text        NOT NULL,
  push_token          text        NOT NULL,
  platform            text        NOT NULL DEFAULT 'android',
  app_version         text,
  timezone            text,
  status              text        NOT NULL DEFAULT 'active',
  invalidated_reason  text,
  last_registered_at  timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_push_devices_installation_unique UNIQUE (user_id, installation_id),
  CONSTRAINT user_push_devices_token_unique UNIQUE (push_token),
  CONSTRAINT user_push_devices_installation_length CHECK (char_length(installation_id) BETWEEN 8 AND 128),
  CONSTRAINT user_push_devices_token_length CHECK (char_length(push_token) BETWEEN 20 AND 4096),
  CONSTRAINT user_push_devices_platform_valid CHECK (platform IN ('android', 'ios')),
  CONSTRAINT user_push_devices_status_valid CHECK (status IN ('active', 'invalid')),
  CONSTRAINT user_push_devices_version_length CHECK (app_version IS NULL OR char_length(app_version) <= 64),
  CONSTRAINT user_push_devices_timezone_length CHECK (timezone IS NULL OR char_length(timezone) <= 64)
);

CREATE INDEX user_push_devices_user_active_idx ON user_push_devices (user_id) WHERE status = 'active';

-- Per-category opt-outs. Missing keys mean "enabled"; the application owns the category list.
CREATE TABLE notification_preferences (
  user_id    uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  categories jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notification_preferences_categories_object CHECK (jsonb_typeof(categories) = 'object')
);

-- Admin-authored messages. A campaign is fanned out once into per-user inbox rows and per-device deliveries.
CREATE TABLE notification_campaigns (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by        uuid        REFERENCES users (id) ON DELETE SET NULL,
  title             text        NOT NULL,
  body              text        NOT NULL,
  category          text        NOT NULL,
  destination       text,
  audience_type     text        NOT NULL,
  audience_user_ids uuid[]      NOT NULL DEFAULT '{}',
  audience_filter   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status            text        NOT NULL DEFAULT 'draft',
  scheduled_at      timestamptz,
  started_at        timestamptz,
  fanned_out_at     timestamptz,
  completed_at      timestamptz,
  cancelled_at      timestamptz,
  cancelled_by      uuid        REFERENCES users (id) ON DELETE SET NULL,
  -- Users that matched the audience, and how many of them were skipped by their own preferences.
  target_count      integer     NOT NULL DEFAULT 0,
  skipped_count     integer     NOT NULL DEFAULT 0,
  -- Dispatcher lease: another worker may only take a 'sending' campaign after this has passed.
  locked_until      timestamptz,
  last_error        text,
  version           integer     NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notification_campaigns_title_length CHECK (char_length(title) BETWEEN 1 AND 100),
  CONSTRAINT notification_campaigns_body_length CHECK (char_length(body) BETWEEN 1 AND 500),
  CONSTRAINT notification_campaigns_category_valid CHECK (
    category IN ('announcements', 'challenges', 'coach_insights', 'goal_updates')
  ),
  CONSTRAINT notification_campaigns_audience_valid CHECK (audience_type IN ('all', 'users', 'segment')),
  CONSTRAINT notification_campaigns_audience_users_bounded CHECK (cardinality(audience_user_ids) <= 1000),
  CONSTRAINT notification_campaigns_status_valid CHECK (
    status IN ('draft', 'scheduled', 'sending', 'sent', 'partially_failed', 'failed', 'cancelled')
  ),
  CONSTRAINT notification_campaigns_schedule_required CHECK (status <> 'scheduled' OR scheduled_at IS NOT NULL),
  CONSTRAINT notification_campaigns_version_positive CHECK (version > 0)
);

CREATE INDEX notification_campaigns_created_idx ON notification_campaigns (created_at DESC, id);
CREATE INDEX notification_campaigns_due_idx ON notification_campaigns (scheduled_at)
  WHERE status IN ('scheduled', 'sending');

-- The user's inbox and notification history. Exists whether or not a push could be delivered.
CREATE TABLE notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  campaign_id uuid        REFERENCES notification_campaigns (id) ON DELETE SET NULL,
  category    text        NOT NULL,
  title       text        NOT NULL,
  body        text        NOT NULL,
  destination text,
  read_at     timestamptz,
  deleted_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notifications_category_valid CHECK (
    category IN ('announcements', 'challenges', 'coach_insights', 'goal_updates')
  )
);

-- Fan-out safety net: re-running a campaign can never create a second inbox row for the same user.
CREATE UNIQUE INDEX notifications_campaign_user_key ON notifications (campaign_id, user_id)
  WHERE campaign_id IS NOT NULL;
CREATE INDEX notifications_user_inbox_idx ON notifications (user_id, created_at DESC, id)
  WHERE deleted_at IS NULL;
CREATE INDEX notifications_user_unread_idx ON notifications (user_id)
  WHERE read_at IS NULL AND deleted_at IS NULL;

-- One push attempt chain per (notification, device). 'accepted' only means FCM took the message;
-- 'received' is set when the app confirms it saw the notification.
CREATE TABLE notification_deliveries (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id     uuid        NOT NULL REFERENCES notifications (id) ON DELETE CASCADE,
  campaign_id         uuid        REFERENCES notification_campaigns (id) ON DELETE CASCADE,
  user_id             uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  device_id           uuid        REFERENCES user_push_devices (id) ON DELETE SET NULL,
  status              text        NOT NULL DEFAULT 'pending',
  attempts            integer     NOT NULL DEFAULT 0,
  next_attempt_at     timestamptz NOT NULL DEFAULT now(),
  locked_until        timestamptz,
  provider_message_id text,
  error_code          text,
  accepted_at         timestamptz,
  received_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notification_deliveries_status_valid CHECK (
    status IN ('pending', 'processing', 'accepted', 'dry_run', 'received', 'failed', 'invalid_token')
  ),
  CONSTRAINT notification_deliveries_attempts_nonnegative CHECK (attempts >= 0),
  CONSTRAINT notification_deliveries_error_code_length CHECK (error_code IS NULL OR char_length(error_code) <= 64)
);

CREATE UNIQUE INDEX notification_deliveries_notification_device_key
  ON notification_deliveries (notification_id, device_id) WHERE device_id IS NOT NULL;
CREATE INDEX notification_deliveries_due_idx ON notification_deliveries (campaign_id, next_attempt_at)
  WHERE status IN ('pending', 'processing');
CREATE INDEX notification_deliveries_campaign_status_idx ON notification_deliveries (campaign_id, status);
