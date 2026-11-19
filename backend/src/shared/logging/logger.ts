import { hostname } from 'node:os';
import { pino, type DestinationStream, type Logger, type LoggerOptions } from 'pino';

export type { Logger };

/** Names every Node log line so it can be told apart from the Python AI backend's lines in one Render log view. */
export const LOG_SERVICE_NAME = 'onusfit-api';

/**
 * Paths censored in every log line. Extend this list when adding sensitive fields.
 *
 * AI observability events are built from typed metadata only (see shared/ai/ai-observability.ts), so
 * the AI entries below are a second line of defence: they censor user content and credentials if a
 * future change ever puts them into a log object by mistake.
 */
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
  // AI credentials and user content (messages, fitness context, images, audio, contact details).
  'apiKey',
  'authorization',
  'serviceSecret',
  'prompt',
  'userMessage',
  'fitnessContext',
  'context',
  'transcript',
  'base64',
  'imageBase64',
  'audioBase64',
  'email',
  '*.apiKey',
  '*.authorization',
  '*.serviceSecret',
  '*.prompt',
  '*.userMessage',
  '*.fitnessContext',
  '*.context',
  '*.transcript',
  '*.base64',
  '*.imageBase64',
  '*.audioBase64',
  '*.email',
];

/** `destination` is for tests (capture the JSON lines); production writes to stdout, which Render collects. */
export function createLogger(
  options: { level: string; pretty: boolean },
  destination?: DestinationStream,
): Logger {
  const config: LoggerOptions = {
    level: options.level,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: { pid: process.pid, hostname: hostname(), service: LOG_SERVICE_NAME },
    formatters: { level: (label) => ({ level: label }) },
  };
  if (options.pretty) {
    config.transport = { target: 'pino-pretty', options: { colorize: true } };
  }
  return destination && !options.pretty ? pino(config, destination) : pino(config);
}
