/**
 * Applies pending SQL migrations (or prints status with `status`).
 * Run as a release step, never from HTTP startup: `npm run db:migrate` / `node dist/scripts/migrate.js`.
 */
import path from 'node:path';
import { ConfigError, loadDatabaseConfig } from '../src/config/env.js';
import { createPool } from '../src/database/pool.js';
import { getMigrationStatus, runMigrations } from '../src/database/migration-runner.js';

const directory = path.resolve(process.env.MIGRATIONS_DIR ?? 'migrations');

async function main(): Promise<void> {
  const pool = createPool(loadDatabaseConfig());
  try {
    if (process.argv.includes('status')) {
      const status = await getMigrationStatus({ pool, directory });
      for (const entry of status) {
        const state = entry.appliedAt ? `applied ${entry.appliedAt.toISOString()}` : 'pending';
        console.log(`${String(entry.version).padStart(4, '0')}_${entry.name}  ${state}`);
      }
      return;
    }
    const { applied } = await runMigrations({ pool, directory, log: (message) => console.log(message) });
    console.log(applied.length > 0 ? `Applied ${applied.length} migration(s).` : 'Nothing to apply.');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) console.error(error.message);
  else console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
