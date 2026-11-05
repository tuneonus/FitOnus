# Database

## Access pattern

- `database/pool.ts` creates one `pg.Pool` with connection, idle, statement and idle-in-transaction timeouts.
- `database/transaction.ts` wraps it in `Database`, the only query surface repositories receive. All values are
  passed as parameters (`$1`, `$2`, …). The few dynamic fragments (sort columns, test database names) go through
  `database/sql.ts` (`orderByClause` whitelists, `quoteIdentifier` validates, `escapeLike` escapes `%`/`_`).

## Transactions (unit of work)

Use cases own transaction boundaries through the `UnitOfWork` port:

```ts
await uow.run(async () => {
  await accounts.updatePasswordHash(userId, hash);
  await sessions.revokeAllForUser(userId, 'password_change', { exceptSessionId });
});
```

- Inside `run`, every repository call uses the same connection (AsyncLocalStorage), even across modules.
- Resolve → `COMMIT`; throw → `ROLLBACK` and rethrow. The client is always released; a client whose `ROLLBACK`
  failed is destroyed instead of returned to the pool.
- Nested `run` joins the outer transaction (no savepoints).
- Concurrent queries inside one transaction (`Promise.all`) are queued on the connection, never interleaved.
- Keep slow work (password hashing, HTTP calls) **outside** `run`; never start fire-and-forget work inside it.

## Concurrency patterns used

| Problem               | Pattern                                                                                                                  | Example                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| Lost updates on edits | Optimistic concurrency: `UPDATE … WHERE id = $1 AND version = $2`; 0 rows → `409 VERSION_CONFLICT` with `currentVersion` | `PgUserRepository.updateProfile`           |
| State transitions     | Compare-and-set on version and current state                                                                             | `changeStatus`, session `rotate`           |
| Duplicate creation    | Unique constraint, translated to a domain error                                                                          | `users_email_key` → `EMAIL_ALREADY_EXISTS` |
| Retried requests      | Idempotency keys (below)                                                                                                 | `POST /api/v1/users`                       |

Integration tests fire 5–8 concurrent writers at each of these and assert exactly one winner.

## Idempotency

`shared/idempotency/` implements retry-safe mutations:

1. The client sends `Idempotency-Key` (8–255 safe characters).
2. The service claims `(scope = actor id, operation, key)` with an `INSERT … ON CONFLICT` guarded by the primary key.
3. Same key + different payload (HMAC fingerprint of canonical JSON) → `422 IDEMPOTENCY_KEY_REUSED`.
4. Completed → the stored result is replayed with `Idempotent-Replayed: true`, without re-running the work.
5. Still running → `409 IDEMPOTENCY_REQUEST_IN_PROGRESS` (retry later).
6. The result is stored by `complete()` **inside the business transaction**, so it is persisted if and only if the
   business writes commit. Failures delete the claim; a crashed process leaves a lease (`IDEMPOTENCY_LEASE_SECONDS`)
   that expires, so no request is blocked forever.
7. Records expire after `IDEMPOTENCY_TTL_HOURS`; `npm run db:cleanup` deletes them.

Idempotency prevents double execution of the _same request_. It does not replace constraints or transactions.

## Migrations

- Files: `migrations/NNNN_snake_case.sql`, forward-only, applied in version order.
- Tracking: `schema_migrations(version, name, checksum, applied_at, execution_ms)`.
- Safety: a PostgreSQL advisory lock serialises concurrent runners; each file runs in its own transaction; editing
  or deleting an applied file aborts the run (SHA-256 checksum, line endings normalised).
- `-- migrate:no-transaction` on its own line runs a file outside a transaction (needed for
  `CREATE INDEX CONCURRENTLY`); such files must be safe to re-run (`IF NOT EXISTS`).
- Run with `npm run db:migrate` (dev) or `node dist/scripts/migrate.js` (release step). The HTTP server never migrates.
- Write migrations to be backward compatible with the currently deployed code (expand → deploy → contract).

## Schema

| Table               | Owner module     | Notes                                                                                                                     |
| ------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `users`             | users            | Lower-cased unique e-mail, role/status checks, `version` for optimistic concurrency, `disabled_at` consistent with status |
| `auth_sessions`     | auth             | FK to `users`; keyed refresh-token hash (unique); revocation reason whitelist; partial index on active sessions           |
| `idempotency_keys`  | shared           | PK (scope, operation, key); completion consistency check; expiry index                                                    |
| `schema_migrations` | migration runner | History and checksums                                                                                                     |

Modules own their tables; another module reads them only through the owner's public API.

## Least privilege

Use separate database roles in production:

- **migrator**: owns the schema, runs `migrate.js` only.
- **app**: `CONNECT`, `USAGE` on the schema, `SELECT, INSERT, UPDATE, DELETE` on tables, `USAGE` on sequences;
  no DDL, no superuser, no `CREATE` on the schema.

```sql
CREATE ROLE app_runtime LOGIN PASSWORD '<from secret manager>';
GRANT CONNECT ON DATABASE app TO app_runtime;
GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
```

## Backups and recovery

- Use managed PostgreSQL with automated daily backups **and** point-in-time recovery (WAL archiving); keep at least
  7–30 days depending on the product.
- Self-hosted: `pg_basebackup` + WAL archiving (e.g. pgBackRest or WAL-G) to separate storage, plus a nightly
  `pg_dump --format=custom` for logical restores.
- Restore drill (do it before launch and regularly): restore into a new instance, run `npm run db:migrate:status`
  against it, start the app with `DATABASE_URL` pointing at it, check `/health/ready`, and compare row counts.
- Document RPO/RTO targets. Treat a backup that has never been restored as untested.
