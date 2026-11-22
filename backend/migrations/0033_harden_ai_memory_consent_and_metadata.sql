-- Migration 0033: Harden AI Memory Consent, Add Memory Metadata & Extraction Jobs Queue
-- FitOnus AI Phase 7: AI Memory Systems (Privacy, Lifecycle & Async Processing)
--
-- 1. Default AI memory consent to false; add explicit consent timestamp.
-- 2. Reset existing accounts without verifiable consent to false.
-- 3. Add memory lifecycle metadata (confidence, source tracking, expires_at, superseded_by_id).
-- 4. Update memory status constraint to support 'superseded'.
-- 5. Create durable PostgreSQL-backed extraction job queue table.
-- 6. Add performance index for chronological message retrieval.

-- 1. Consent defaults and timestamp
ALTER TABLE user_settings
  ALTER COLUMN ai_memory_enabled SET DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_memory_consented_at timestamptz NULL;

-- 2. Safe grandfathering: ensure existing users without affirmative consent are disabled
UPDATE user_settings
SET ai_memory_enabled = false
WHERE ai_memory_consented_at IS NULL;

-- 3. Necessary memory metadata
ALTER TABLE coach_memories
  ADD COLUMN IF NOT EXISTS confidence numeric(3,2) NOT NULL DEFAULT 1.00 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  ADD COLUMN IF NOT EXISTS source_message_id text REFERENCES coach_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_conversation_id uuid REFERENCES coach_conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS superseded_by_id uuid REFERENCES coach_memories(id) ON DELETE SET NULL;

-- 4. Update status check constraint to include 'superseded'
ALTER TABLE coach_memories DROP CONSTRAINT IF EXISTS coach_memories_status_check;
ALTER TABLE coach_memories ADD CONSTRAINT coach_memories_status_check
  CHECK (status IN ('active', 'pending_approval', 'dismissed', 'archived', 'superseded'));

-- 5. Chronological message retrieval index
CREATE INDEX IF NOT EXISTS idx_coach_messages_convo_user_created_desc
  ON coach_messages (conversation_id, user_id, created_at DESC, id DESC);

-- 6. Durable PostgreSQL-backed extraction jobs queue
CREATE TABLE IF NOT EXISTS ai_memory_extraction_jobs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id uuid        NOT NULL REFERENCES coach_conversations(id) ON DELETE CASCADE,
  message_id      text        NOT NULL,
  status          text        NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')) DEFAULT 'pending',
  attempts        integer     NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts    integer     NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_ai_memory_jobs_convo_msg UNIQUE (conversation_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_memory_jobs_due
  ON ai_memory_extraction_jobs (next_attempt_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_ai_memory_jobs_user
  ON ai_memory_extraction_jobs (user_id);
