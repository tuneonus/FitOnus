-- Purpose : password reset now uses a 6-digit e-mailed OTP instead of a 43-character token.
--           Adds the per-OTP failed-attempt counter (max 5 failed verifications, enforced by the application).
-- Safety  : additive only and idempotent (ADD COLUMN IF NOT EXISTS). Migration 0016 is NOT edited.
--           Existing rows get failed_attempts = 0. Rows issued by the old token flow can never match a
--           6-digit OTP (their digest was computed differently), so they simply expire unused; the
--           per-user 60-second resend cooldown and hourly limit still count them, which is harmless.
--
-- Storage model (no further schema change needed)
--   * token_hash holds HMAC-SHA256(HMAC_SECRET, 'password-reset-otp:' || id || ':' || otp). Mixing in the
--     random row id makes every digest unique (the existing UNIQUE constraint keeps working even though a
--     6-digit code repeats across rows) and binds a digest to its row. The OTP itself is never stored.
--   * A 6-digit code has only 1,000,000 values, so the keyed digest alone would not stop a determined
--     attacker who holds both the database AND the HMAC secret; the real brute-force defences are the
--     5-attempt cap, the 5-minute expiry, and the per-IP rate limit on /reset-password.
--
-- Rollback (manual, only before this has been relied on in production):
--   ALTER TABLE password_reset_tokens DROP COLUMN IF EXISTS failed_attempts;

ALTER TABLE password_reset_tokens
  ADD COLUMN IF NOT EXISTS failed_attempts smallint NOT NULL DEFAULT 0
    CONSTRAINT password_reset_tokens_failed_attempts_range CHECK (failed_attempts >= 0 AND failed_attempts <= 100);
