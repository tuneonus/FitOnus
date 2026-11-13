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
  // Transactional e-mail (password reset). Unset/empty/"none" keeps the feature off (the endpoints answer 503).
  EMAIL_PROVIDER: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toLowerCase() || undefined : value),
    z.enum(['none', 'resend']).default('none'),
  ),
  EMAIL_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_TIMEOUT_MS: integer(5_000, 500, 30_000),
  // Push notifications (FCM HTTP v1). Credentials are a Google service-account key, supplied either as the raw JSON
  // or base64 of it (base64 survives dashboards that mangle newlines). Both unset keeps push delivery off.
  FCM_SERVICE_ACCOUNT_JSON: z.string().optional(),
  FCM_SERVICE_ACCOUNT_BASE64: z.string().optional(),
  FCM_PROJECT_ID: z.string().optional(),
  // Provider validates every message but delivers nothing. For wiring checks on DEV.
  FCM_DRY_RUN: booleanString('false'),
  FCM_REQUEST_TIMEOUT_MS: integer(10_000, 1_000, 60_000),
  // Runs the scheduler inside this process. Turn off when a separate worker or external cron drives dispatch.
  NOTIFICATIONS_DISPATCHER_ENABLED: booleanString('true'),
  NOTIFICATIONS_POLL_INTERVAL_MS: integer(10_000, 1_000, 3_600_000),
  NOTIFICATIONS_MAX_ATTEMPTS: integer(4, 1, 10),
  // Enables POST /api/v1/internal/notifications/dispatch for an external scheduler. Unset = endpoint disabled.
  NOTIFICATIONS_DISPATCH_SECRET: z.string().optional(),
});

export type DatabaseConfig = {
  url: string;
  poolMax: number;
  connectionTimeoutMs: number;
  idleTimeoutMs: number;
  statementTimeoutMs: number;
  ssl: 'disable' | 'require' | 'verify-full';
};

export type EmailConfig =
  { provider: 'none' } | { provider: 'resend'; apiKey: string; from: string; timeoutMs: number };

export type NotificationsConfig = {
  /** Null when no service account is configured: campaigns cannot be sent, the inbox still works. */
  fcm: {
    projectId: string;
    clientEmail: string;
    privateKey: string;
    tokenUri: string;
    dryRun: boolean;
    timeoutMs: number;
  } | null;
  dispatcher: { enabled: boolean; pollIntervalMs: number; maxAttempts: number };
  dispatchSecret: string | undefined;
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
  /** Outbound e-mail. `none` means no delivery channel is configured, so password reset stays disabled. */
  email: EmailConfig;
  notifications: NotificationsConfig;
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

/** `addr@host.tld` or `Display Name <addr@host.tld>`; no control characters, so it is safe in a header-like field. */
const EMAIL_ADDRESS = '[^\\s<>@,;"]+@[^\\s<>@,;"]+\\.[^\\s<>@,;"]+';
const EMAIL_FROM_PATTERN = new RegExp(`^(?:[^<>\\r\\n]*[^<>\\s]\\s*<${EMAIL_ADDRESS}>|${EMAIL_ADDRESS})$`);

/** Issues name keys and rules only. The API key and sender are never echoed. */
function emailIssues(parsed: z.output<typeof appSchema>): string[] {
  if (parsed.EMAIL_PROVIDER !== 'resend') return [];
  const issues: string[] = [];
  if (!parsed.EMAIL_API_KEY?.trim()) issues.push('EMAIL_API_KEY: required when EMAIL_PROVIDER=resend');
  const from = parsed.EMAIL_FROM?.trim();
  if (!from) issues.push('EMAIL_FROM: required when EMAIL_PROVIDER=resend');
  else if (!EMAIL_FROM_PATTERN.test(from)) {
    issues.push('EMAIL_FROM: must look like "noreply@example.org" or "Name <noreply@example.org>"');
  }
  return issues;
}

function toEmailConfig(parsed: z.output<typeof appSchema>): EmailConfig {
  if (parsed.EMAIL_PROVIDER !== 'resend') return { provider: 'none' };
  return {
    provider: 'resend',
    apiKey: parsed.EMAIL_API_KEY!.trim(),
    from: parsed.EMAIL_FROM!.trim(),
    timeoutMs: parsed.EMAIL_TIMEOUT_MS,
  };
}

interface ParsedServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  tokenUri: string | undefined;
}

/**
 * Reads the service-account key. Issues name the variable and the rule only: neither the key material nor any
 * fragment of the parse error (which can quote the input) is ever echoed.
 */
function parseServiceAccount(
  parsed: z.output<typeof appSchema>,
  issues: string[],
): ParsedServiceAccount | null {
  const raw = parsed.FCM_SERVICE_ACCOUNT_JSON?.trim();
  const encoded = parsed.FCM_SERVICE_ACCOUNT_BASE64?.trim();
  if (!raw && !encoded) return null;

  let source = raw;
  let key = 'FCM_SERVICE_ACCOUNT_JSON';
  if (!source) {
    key = 'FCM_SERVICE_ACCOUNT_BASE64';
    source = Buffer.from(encoded!, 'base64').toString('utf8');
  }

  let json: unknown;
  try {
    json = JSON.parse(source);
  } catch {
    issues.push(`${key}: must be a service-account JSON document`);
    return null;
  }
  const record = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const text = (name: string): string => {
    const value = record[name];
    return typeof value === 'string' ? value.trim() : '';
  };
  const clientEmail = text('client_email');
  const privateKey = text('private_key');
  const projectId = parsed.FCM_PROJECT_ID?.trim() || text('project_id');
  if (!clientEmail) issues.push(`${key}: missing client_email`);
  if (!/-----BEGIN PRIVATE KEY-----/.test(privateKey))
    issues.push(`${key}: missing or malformed private_key`);
  if (!projectId) issues.push(`${key}: missing project_id (or set FCM_PROJECT_ID)`);
  if (issues.length > 0 && (!clientEmail || !privateKey || !projectId)) return null;
  return { projectId, clientEmail, privateKey, tokenUri: text('token_uri') || undefined };
}

const GOOGLE_TOKEN_URI = 'https://oauth2.googleapis.com/token';

/** Only Google token endpoints are trusted, so a tampered key file cannot redirect the signed assertion. */
function trustedTokenUri(candidate: string | undefined): string {
  try {
    const url = new URL(candidate ?? GOOGLE_TOKEN_URI);
    return url.protocol === 'https:' && url.hostname.endsWith('.googleapis.com')
      ? url.toString()
      : GOOGLE_TOKEN_URI;
  } catch {
    return GOOGLE_TOKEN_URI;
  }
}

function toNotificationsConfig(
  parsed: z.output<typeof appSchema>,
  account: ParsedServiceAccount | null,
): NotificationsConfig {
  return {
    fcm: account
      ? {
          projectId: account.projectId,
          clientEmail: account.clientEmail,
          privateKey: account.privateKey,
          tokenUri: trustedTokenUri(account.tokenUri),
          dryRun: parsed.FCM_DRY_RUN,
          timeoutMs: parsed.FCM_REQUEST_TIMEOUT_MS,
        }
      : null,
    dispatcher: {
      enabled: parsed.NOTIFICATIONS_DISPATCHER_ENABLED,
      pollIntervalMs: parsed.NOTIFICATIONS_POLL_INTERVAL_MS,
      maxAttempts: parsed.NOTIFICATIONS_MAX_ATTEMPTS,
    },
    dispatchSecret: parsed.NOTIFICATIONS_DISPATCH_SECRET?.trim() || undefined,
  };
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

  const issues = [...corsIssues(parsed.CORS_ORIGINS), ...emailIssues(parsed)];
  const serviceAccount = parseServiceAccount(parsed, issues);
  const dispatchSecret = parsed.NOTIFICATIONS_DISPATCH_SECRET?.trim();
  if (dispatchSecret && dispatchSecret.length < 32) {
    issues.push('NOTIFICATIONS_DISPATCH_SECRET: must be at least 32 characters');
  }
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
    email: toEmailConfig(parsed),
    notifications: toNotificationsConfig(parsed, serviceAccount),
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
