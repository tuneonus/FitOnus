import { pino, type Logger, type LoggerOptions } from 'pino';

export type { Logger };

/** Paths censored in every log line. Extend this list when adding sensitive fields. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["idempotency-key"]',
  'res.headers["set-cookie"]',
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'accessToken',
  'refreshToken',
  'token',
  '*.password',
  '*.passwordHash',
  '*.currentPassword',
  '*.newPassword',
  '*.accessToken',
  '*.refreshToken',
  '*.token',
  '*.secret',
];

export function createLogger(options: { level: string; pretty: boolean }): Logger {
  const config: LoggerOptions = {
    level: options.level,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
  };
  if (options.pretty) {
    config.transport = { target: 'pino-pretty', options: { colorize: true } };
  }
  return pino(config);
}
