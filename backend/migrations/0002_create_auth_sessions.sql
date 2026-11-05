-- Server-side sessions backing refresh tokens. Only a keyed hash of the refresh secret is stored.
CREATE TABLE auth_sessions (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  refresh_token_hash text        NOT NULL,
  rotation_count     integer     NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  last_used_at       timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  revoked_at         timestamptz,
  revoke_reason      text,
  user_agent         text,
  ip_address         text,

  CONSTRAINT auth_sessions_refresh_token_hash_key UNIQUE (refresh_token_hash),
  CONSTRAINT auth_sessions_revocation_consistent CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL)),
  CONSTRAINT auth_sessions_revoke_reason_valid CHECK (
    revoke_reason IS NULL
    OR revoke_reason IN ('logout', 'logout_all', 'token_reuse', 'password_change', 'user_revoked', 'account_disabled')
  ),
  CONSTRAINT auth_sessions_expiry_after_creation CHECK (expires_at > created_at),
  CONSTRAINT auth_sessions_rotation_count_non_negative CHECK (rotation_count >= 0),
  CONSTRAINT auth_sessions_user_agent_length CHECK (user_agent IS NULL OR char_length(user_agent) <= 512),
  CONSTRAINT auth_sessions_ip_length CHECK (ip_address IS NULL OR char_length(ip_address) <= 64)
);

CREATE INDEX auth_sessions_user_active_idx ON auth_sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX auth_sessions_expires_at_idx ON auth_sessions (expires_at);
