import type { Express } from 'express';
import type pg from 'pg';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig, type AppConfig } from '../../src/config/env.js';
import { createContainer, type Container, type ContainerOverrides } from '../../src/container.js';
import type { Role } from '../../src/shared/auth/permissions.js';
import { createLogger } from '../../src/shared/logging/logger.js';
import { Argon2PasswordHasher } from '../../src/shared/security/argon2-password-hasher.js';
import { createTestDatabase, type TestDatabase } from './test-database.js';

/** Test-only configuration. Secrets are obviously fake and never used outside tests. */
export const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  JWT_ACCESS_SECRET: 'test-only-access-token-signing-secret-0123456789',
  HMAC_SECRET: 'test-only-hmac-secret-for-keyed-hashing-0123456789',
  JWT_ISSUER: 'generic-backend-test',
  JWT_AUDIENCE: 'generic-backend-test-clients',
  CORS_ORIGINS: 'http://localhost:5173',
  RATE_LIMIT_MAX: '100000',
  AUTH_RATE_LIMIT_MAX: '10000',
};

export interface TestContext {
  app: Express;
  db: TestDatabase;
  config: AppConfig;
  container: Container;
  close(): Promise<void>;
}

export async function createTestContext(
  overrides: Record<string, string> = {},
  containerOverrides: ContainerOverrides = {},
): Promise<TestContext> {
  const db = await createTestDatabase();
  try {
    const config = loadConfig({ ...TEST_ENV, DATABASE_URL: db.url, ...overrides });
    const container = createContainer(config, db.pool, undefined, containerOverrides);
    const app = createApp({ config, logger: createLogger({ level: 'silent', pretty: false }), container });
    return { app, db, config, container, close: () => db.drop() };
  } catch (error) {
    await db.drop();
    throw error;
  }
}

const hasher = new Argon2PasswordHasher();
let counter = 0;

export interface SeededUser {
  id: string;
  email: string;
  password: string;
}

/** Inserts a user directly (bypassing the API) for test setup. */
export async function seedUser(
  pool: pg.Pool,
  options: {
    role?: Role;
    email?: string;
    password?: string;
    displayName?: string;
    status?: 'active' | 'disabled';
  } = {},
): Promise<SeededUser> {
  counter += 1;
  const email = options.email ?? `user${counter}-${Date.now()}@example.test`;
  const password = options.password ?? 'correct horse battery staple';
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, display_name, password_hash, role, status, disabled_at)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 = 'disabled' THEN now() END) RETURNING id`,
    [
      email,
      options.displayName ?? `User ${counter}`,
      await hasher.hash(password),
      options.role ?? 'member',
      options.status ?? 'active',
    ],
  );
  return { id: rows[0]!.id, email, password };
}

export interface LoggedIn {
  accessToken: string;
  refreshToken: string;
  auth: { Authorization: string };
}

export async function login(app: Express, user: { email: string; password: string }): Promise<LoggedIn> {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: user.email, password: user.password });
  if (response.status !== 200)
    throw new Error(`Login failed: ${response.status} ${JSON.stringify(response.body)}`);
  const data = response.body.data as { accessToken: string; refreshToken: string };
  return { ...data, auth: { Authorization: `Bearer ${data.accessToken}` } };
}
