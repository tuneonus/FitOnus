-- Idempotency records for safely retried mutations. Scoped by actor + operation + client key.
CREATE TABLE idempotency_keys (
  scope           text        NOT NULL,
  operation       text        NOT NULL,
  idempotency_key text        NOT NULL,
  fingerprint     text        NOT NULL,
  status          text        NOT NULL,
  lock_token      uuid        NOT NULL,
  locked_until    timestamptz NOT NULL,
  response        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  expires_at      timestamptz NOT NULL,

  PRIMARY KEY (scope, operation, idempotency_key),
  CONSTRAINT idempotency_keys_status_valid CHECK (status IN ('in_progress', 'completed')),
  CONSTRAINT idempotency_keys_key_length CHECK (char_length(idempotency_key) BETWEEN 8 AND 255),
  CONSTRAINT idempotency_keys_completion_consistent CHECK (
    (status = 'completed') = (response IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE INDEX idempotency_keys_expires_at_idx ON idempotency_keys (expires_at);
