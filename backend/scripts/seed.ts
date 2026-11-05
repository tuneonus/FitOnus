/**
 * Development seed: creates an admin account from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD.
 * Refuses to run in production or against a non-local database unless explicitly allowed.
 */
import { ConfigError, loadConfig } from '../src/config/env.js';
import { createPool } from '../src/database/pool.js';
import { Database, PgUnitOfWork } from '../src/database/transaction.js';
import { createUsersModule } from '../src/modules/users/index.js';
import { IdempotencyService } from '../src/shared/idempotency/idempotency.js';
import { PgIdempotencyStore } from '../src/shared/idempotency/pg-idempotency-store.js';
import { Argon2PasswordHasher } from '../src/shared/security/argon2-password-hasher.js';
import { HmacKeyedHasher } from '../src/shared/security/hmac-keyed-hasher.js';
import { assertPasswordPolicy } from '../src/shared/security/password-policy.js';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'db']);

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.isProduction) throw new Error('Refusing to seed: NODE_ENV=production');

  const host = new URL(config.database.url).hostname;
  if (!LOCAL_HOSTS.has(host) && !process.argv.includes('--allow-remote-database')) {
    throw new Error(
      `Refusing to seed non-local database host "${host}" (pass --allow-remote-database to override)`,
    );
  }

  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password)
    throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to seed an admin user');
  assertPasswordPolicy(password);

  const pool = createPool(config.database);
  try {
    const database = new Database(pool);
    const hasher = new Argon2PasswordHasher();
    const keyedHasher = new HmacKeyedHasher(config.security.hmacSecret);
    const users = createUsersModule({
      basePath: '/',
      db: database,
      uow: new PgUnitOfWork(database),
      passwordHasher: hasher,
      idempotency: new IdempotencyService(new PgIdempotencyStore(database), keyedHasher, config.idempotency),
    });

    if (await users.accounts.findCredentialsByEmail(email)) {
      console.log(`Admin ${email} already exists; nothing to do.`);
      return;
    }
    await users.accounts.registerAccount({
      email,
      displayName: 'Administrator',
      passwordHash: await hasher.hash(password),
      role: 'admin',
    });
    console.log(`Created admin ${email}.`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof ConfigError || error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
