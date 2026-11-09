-- Migration 0013: Create Coach Conversations, Messages, and AI Memories
-- FitOnus AI Phase 3: Persistent Chat History & User-Controlled AI Memory

CREATE TABLE IF NOT EXISTS coach_conversations (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      text        NOT NULL,
  preview    text        NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_conversations_user_updated
  ON coach_conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS coach_messages (
  id              text        PRIMARY KEY,
  conversation_id uuid        NOT NULL REFERENCES coach_conversations(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            text        NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  text            text        NOT NULL DEFAULT '',
  blocks          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  sources         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  follow_ups      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_messages_convo_created
  ON coach_messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_coach_messages_user
  ON coach_messages (user_id);

CREATE TABLE IF NOT EXISTS coach_memories (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category   text        NOT NULL CHECK (category IN ('goals', 'injuries', 'food', 'workout', 'medical', 'supplements', 'progress', 'conversations')),
  text       text        NOT NULL,
  source     text        NOT NULL DEFAULT 'Conversation',
  sensitive  boolean     NOT NULL DEFAULT false,
  status     text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending_approval', 'dismissed', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_memories_user_status
  ON coach_memories (user_id, status, created_at DESC);

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS ai_memory_enabled boolean NOT NULL DEFAULT true;

