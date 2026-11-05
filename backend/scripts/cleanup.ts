/**
 * Housekeeping: deletes expired idempotency records and long-dead sessions.
 * Schedule it (cron, Kubernetes CronJob, …) e.g. hourly; it is safe to run concurrently.
 */
import { ConfigError, loadDatabaseConfig } from '../src/config/env.js';
import { createPool } from '../src/database/pool.js';
import { Database } from '../src/database/transaction.js';
import { createAuthMaintenance } from '../src/modules/auth/index.js';
import { PgIdempotencyStore } from '../src/shared/idempotency/pg-idempotency-store.js';

const SESSION_RETENTION_DAYS = Number(process.env.SESSION_RETENTION_DAYS ?? 30);

async function main(): Promise<void> {
  const pool = createPool(loadDatabaseConfig());
  try {
    const database = new Database(pool);
    const idempotencyKeys = await new PgIdempotencyStore(database).deleteExpired();
    const sessions = await createAuthMaintenance(database).purgeInactiveSessions(SESSION_RETENTION_DAYS);
    console.log(`Deleted ${idempotencyKeys} expired idempotency key(s) and ${sessions} inactive session(s).`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof ConfigError || error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
