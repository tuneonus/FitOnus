-- Migration 0019: Add Message Feedback to Coach Messages
-- Enables user feedback (like / dislike) tracking on AI Coach responses

ALTER TABLE coach_messages
  ADD COLUMN IF NOT EXISTS feedback VARCHAR(16) CHECK (feedback IN ('like', 'dislike', 'none'));

CREATE INDEX IF NOT EXISTS idx_coach_messages_feedback
  ON coach_messages (conversation_id, feedback)
  WHERE feedback IS NOT NULL;
