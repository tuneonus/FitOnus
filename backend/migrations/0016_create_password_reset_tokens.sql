-- Purpose : single-use password reset tokens for POST /api/v1/auth/forgot-password + /reset-password.
-- Code depending on it:
--             src/modules/auth/infrastructure/pg-password-reset-token-repository.ts
--             src/modules/auth/application/use-cases/{request-password-reset,reset-password}.ts
-- Safety  : additive only, idempotent (IF NOT EXISTS), no data backfill, no change to existing tables.
--           Apply this migration BEFORE deploying a build that sets EMAIL_PROVIDER=resend: the reset use
--           cases are only built when a delivery channel is configured (see src/container.ts), and
--           without this table /forgot-password would still answer 200 while storing nothing.
--
-- Security model
--   * Only a keyed HMAC-SHA256 digest (HMAC_SECRET) of the 256-bit token is stored; the raw token exists
--     only in the e-mail. A database leak alone cannot be turned into a working reset link.
--   * `used_at` is set when a token is redeemed OR superseded (a newer request, or a completed reset,
--     invalidates every other outstanding token of the user). A token is redeemable iff
--     used_at IS NULL AND expires_at > now. Redemption is one atomic UPDATE ... RETURNING, so a
--     double-submit race has exactly one winner.
--   * request_ip / user_agent are optional forensic metadata for abuse investigation (truncated by the app).
--   * Rows are also the per-user request counter used to throttle mail-bombing, so superseded rows must
--     be kept for at least the throttle window (default 60 min). Purge with retention >= 1 day
--     (see PgPasswordResetTokenRepository.purge / createAuthMaintenance().purgePasswordResetTokens).
--
-- Rollback (manual, only before any production reset has been issued):
--   DROP TABLE IF EXISTS password_reset_tokens;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  request_ip  text,
  user_agent  text,

  CONSTRAINT password_reset_tokens_token_hash_key UNIQUE (token_hash),
  CONSTRAINT password_reset_tokens_expiry_after_creation CHECK (expires_at > created_at),
  CONSTRAINT password_reset_tokens_token_hash_length CHECK (char_length(token_hash) BETWEEN 16 AND 128),
  CONSTRAINT password_reset_tokens_request_ip_length CHECK (request_ip IS NULL OR char_length(request_ip) <= 64),
  CONSTRAINT password_reset_tokens_user_agent_length CHECK (user_agent IS NULL OR char_length(user_agent) <= 512)
);

-- Per-user throttle count (created_at window) and "latest tokens of this user" lookups.
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_created_idx
  ON password_reset_tokens (user_id, created_at DESC);

-- Invalidating a user's outstanding tokens only ever touches unredeemed rows.
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_outstanding_idx
  ON password_reset_tokens (user_id) WHERE used_at IS NULL;

-- Housekeeping: delete expired / redeemed rows.
CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_at_idx
  ON password_reset_tokens (expires_at);
