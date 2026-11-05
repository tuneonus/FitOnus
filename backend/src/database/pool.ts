import pg from 'pg';
import type { DatabaseConfig } from '../config/env.js';
import type { Logger } from '../shared/logging/logger.js';
import { setupDnsFallback } from './dns-fallback.js';

export type Pool = pg.Pool;

export function createPool(config: DatabaseConfig, logger?: Logger): pg.Pool {
  setupDnsFallback();

  const pool = new pg.Pool({
    connectionString: config.url,
    max: config.poolMax,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    idleTimeoutMillis: config.idleTimeoutMs,
    statement_timeout: config.statementTimeoutMs,
    idle_in_transaction_session_timeout: config.statementTimeoutMs * 2,
    application_name: 'generic-backend',
    ssl: config.ssl === 'disable' ? false : { rejectUnauthorized: config.ssl === 'verify-full' },
  });
  // Idle clients can error when the server restarts; without a listener this crashes the process.
  pool.on('error', (error) => logger?.error({ err: error }, 'Idle PostgreSQL client error'));
  return pool;
}
