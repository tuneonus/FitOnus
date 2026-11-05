-- Admin Audit Logs: Records administrative operations for security and compliance.
CREATE TABLE admin_audit_logs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id       uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  action         text        NOT NULL,
  target_user_id uuid        REFERENCES users (id) ON DELETE SET NULL,
  details        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ip_address     text,
  user_agent     text,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT admin_audit_logs_action_length CHECK (char_length(action) BETWEEN 1 AND 100),
  CONSTRAINT admin_audit_logs_ip_length CHECK (ip_address IS NULL OR char_length(ip_address) <= 64),
  CONSTRAINT admin_audit_logs_ua_length CHECK (user_agent IS NULL OR char_length(user_agent) <= 512)
);

CREATE INDEX admin_audit_logs_created_at_idx ON admin_audit_logs (created_at DESC, id);
CREATE INDEX admin_audit_logs_admin_id_idx ON admin_audit_logs (admin_id);
CREATE INDEX admin_audit_logs_target_user_id_idx ON admin_audit_logs (target_user_id) WHERE target_user_id IS NOT NULL;
