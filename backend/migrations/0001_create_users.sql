-- Users: identity and profile. Integrity rules live here, not only in application code.
CREATE TABLE users (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text        NOT NULL,
  display_name  text        NOT NULL,
  password_hash text        NOT NULL,
  role          text        NOT NULL DEFAULT 'member',
  status        text        NOT NULL DEFAULT 'active',
  version       integer     NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  disabled_at   timestamptz,

  CONSTRAINT users_email_key UNIQUE (email),
  -- The application normalises e-mail to lower case; the database refuses anything else,
  -- which makes the UNIQUE constraint case-insensitive in practice.
  CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 254),
  CONSTRAINT users_display_name_length CHECK (char_length(display_name) BETWEEN 1 AND 100),
  CONSTRAINT users_role_valid CHECK (role IN ('admin', 'member')),
  CONSTRAINT users_status_valid CHECK (status IN ('active', 'disabled')),
  CONSTRAINT users_disabled_at_consistent CHECK ((status = 'disabled') = (disabled_at IS NOT NULL)),
  CONSTRAINT users_version_positive CHECK (version > 0)
);

CREATE INDEX users_created_at_idx ON users (created_at DESC, id);
CREATE INDEX users_status_idx ON users (status);
