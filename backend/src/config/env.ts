import { z } from 'zod';

/** Thrown when configuration is invalid. `issues` name keys and rules, never values. */
export class ConfigError extends Error {
  override readonly name = 'ConfigError';
  constructor(readonly issues: readonly string[]) {
    super(`Invalid configuration:\n  - ${issues.join('\n  - ')}`);
  }
}

const booleanString = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((value) => value === 'true');

const integer = (fallback: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).default(fallback);

const secret = z.string().min(32, 'must be at least 32 characters');

const databaseSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((value) => /^postgres(ql)?:\/\//.test(value), 'must be a postgres:// connection string'),
  DATABASE_POOL_MAX: integer(10, 1, 100),
  DATABASE_CONNECTION_TIMEOUT_MS: integer(5_000, 100, 60_000),
  DATABASE_IDLE_TIMEOUT_MS: integer(30_000, 1_000, 600_000),
  DATABASE_STATEMENT_TIMEOUT_MS: integer(10_000, 100, 600_000),
  DATABASE_SSL: z.enum(['disable', 'require', 'verify-full']).default('disable'),
});

const appSchema = databaseSchema.extend({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: integer(3000, 1, 65_535),
  TRUST_PROXY: integer(0, 0, 10),
  BODY_LIMIT: z
    .string()
    .regex(/^\d+(kb|mb)$/, 'must look like "100kb" or "1mb"')
    .default('100kb'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  SHUTDOWN_TIMEOUT_MS: integer(10_000, 1_000, 120_000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOG_PRETTY: booleanString('false'),
  JWT_ACCESS_SECRET: secret,
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  ACCESS_TOKEN_TTL_SECONDS: integer(900, 60, 3_600),
  REFRESH_TOKEN_TTL_DAYS: integer(30, 1, 90),
  HMAC_SECRET: secret,
  AUTH_PUBLIC_REGISTRATION: booleanString('false'),
  RATE_LIMIT_WINDOW_MS: integer(900_000, 1_000, 86_400_000),
  RATE_LIMIT_MAX: integer(300, 1, 100_000),
  AUTH_RATE_LIMIT_MAX: integer(10, 1, 10_000),
  IDEMPOTENCY_TTL_HOURS: integer(24, 1, 720),
  IDEMPOTENCY_LEASE_SECONDS: integer(60, 5, 3_600),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-3.5-flash-lite'),
});

export type DatabaseConfig = {
  url: string;
  poolMax: number;
  connectionTimeoutMs: number;
  idleTimeoutMs: number;
  statementTimeoutMs: number;
  ssl: 'disable' | 'require' | 'verify-full';
};

export type AppConfig = {
  env: 'development' | 'test' | 'production';
  isProduction: boolean;
  http: {
    host: string;
    port: number;
    trustProxy: number;
    bodyLimit: string;
    corsOrigins: string[];
    shutdownTimeoutMs: number;
  };
  log: { level: string; pretty: boolean };
  database: DatabaseConfig;
  auth: {
    accessTokenSecret: string;
    issuer: string;
    audience: string;
    accessTokenTtlSeconds: number;
    refreshTokenTtlDays: number;
    publicRegistration: boolean;
  };
  security: { hmacSecret: string };
  gemini: { apiKey?: string; model: string };
  rateLimit: { windowMs: number; max: number; authMax: number };
  idempotency: { ttlSeconds: number; leaseSeconds: number };
};

type Env = Record<string, string | undefined>;

const PLACEHOLDER = /change[-_ ]?me|placeholder|example|secret123/i;

const formatIssues = (error: z.ZodError): string[] =>
  error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);

function productionIssues(parsed: z.output<typeof appSchema>, env: Env): string[] {
  const issues: string[] = [];
  for (const key of ['JWT_ACCESS_SECRET', 'HMAC_SECRET'] as const) {
    if (PLACEHOLDER.test(parsed[key]))
      issues.push(`${key}: placeholder values are not allowed in production`);
  }
  if (parsed.JWT_ACCESS_SECRET === parsed.HMAC_SECRET) {
    issues.push('HMAC_SECRET: must differ from JWT_ACCESS_SECRET');
  }
  if (parsed.CORS_ORIGINS.some((origin) => !origin.startsWith('https://'))) {
    issues.push('CORS_ORIGINS: production origins must use https');
  }
  if (parsed.LOG_PRETTY) issues.push('LOG_PRETTY: must be false in production');
  if (env.AUTH_PUBLIC_REGISTRATION === undefined) {
    issues.push('AUTH_PUBLIC_REGISTRATION: must be set explicitly in production');
  }
  return issues;
}

function corsIssues(origins: readonly string[]): string[] {
  return origins.flatMap((origin) => {
    if (origin === '*') return ['CORS_ORIGINS: wildcard "*" is not allowed; list origins explicitly'];
    try {
      return new URL(origin).origin === origin ? [] : [`CORS_ORIGINS: "${origin}" is not a bare origin`];
    } catch {
      return [`CORS_ORIGINS: "${origin}" is not a valid URL`];
    }
  });
}

const toDatabaseConfig = (parsed: z.output<typeof databaseSchema>): DatabaseConfig => ({
  url: parsed.DATABASE_URL,
  poolMax: parsed.DATABASE_POOL_MAX,
  connectionTimeoutMs: parsed.DATABASE_CONNECTION_TIMEOUT_MS,
  idleTimeoutMs: parsed.DATABASE_IDLE_TIMEOUT_MS,
  statementTimeoutMs: parsed.DATABASE_STATEMENT_TIMEOUT_MS,
  ssl: parsed.DATABASE_SSL,
});

/** Database-only configuration, so migration/seed scripts don't need app secrets. */
export function loadDatabaseConfig(env: Env = process.env): DatabaseConfig {
  const result = databaseSchema.safeParse(env);
  if (!result.success) throw new ConfigError(formatIssues(result.error));
  return toDatabaseConfig(result.data);
}

export function loadConfig(env: Env = process.env): AppConfig {
  const result = appSchema.safeParse(env);
  if (!result.success) throw new ConfigError(formatIssues(result.error));
  const parsed = result.data;

  const issues = corsIssues(parsed.CORS_ORIGINS);
  if (parsed.NODE_ENV === 'production') issues.push(...productionIssues(parsed, env));
  if (issues.length > 0) throw new ConfigError(issues);

  return {
    env: parsed.NODE_ENV,
    isProduction: parsed.NODE_ENV === 'production',
    http: {
      host: parsed.HOST,
      port: parsed.PORT,
      trustProxy: parsed.TRUST_PROXY,
      bodyLimit: parsed.BODY_LIMIT,
      corsOrigins: parsed.CORS_ORIGINS,
      shutdownTimeoutMs: parsed.SHUTDOWN_TIMEOUT_MS,
    },
    log: { level: parsed.LOG_LEVEL, pretty: parsed.LOG_PRETTY },
    database: toDatabaseConfig(parsed),
    auth: {
      accessTokenSecret: parsed.JWT_ACCESS_SECRET,
      issuer: parsed.JWT_ISSUER,
      audience: parsed.JWT_AUDIENCE,
      accessTokenTtlSeconds: parsed.ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenTtlDays: parsed.REFRESH_TOKEN_TTL_DAYS,
      publicRegistration: parsed.AUTH_PUBLIC_REGISTRATION,
    },
    security: { hmacSecret: parsed.HMAC_SECRET },
    gemini: {
      apiKey: parsed.GEMINI_API_KEY,
      model: parsed.GEMINI_MODEL,
    },
    rateLimit: {
      windowMs: parsed.RATE_LIMIT_WINDOW_MS,
      max: parsed.RATE_LIMIT_MAX,
      authMax: parsed.AUTH_RATE_LIMIT_MAX,
    },
    idempotency: {
      ttlSeconds: parsed.IDEMPOTENCY_TTL_HOURS * 3_600,
      leaseSeconds: parsed.IDEMPOTENCY_LEASE_SECONDS,
    },
  };
}
