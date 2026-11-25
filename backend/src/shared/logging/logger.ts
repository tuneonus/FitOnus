import { hostname } from 'node:os';
import { pino, type DestinationStream, type Logger, type LoggerOptions } from 'pino';

export type { Logger };

/** Names every Node log line so it can be told apart from the Python AI backend's lines in one Render log view. */
export const LOG_SERVICE_NAME = 'onusfit-api';

/**
 * Paths censored in every log line. Extend this list when adding sensitive fields.
 *
 * AI observability events are built from typed metadata only (see shared/ai/ai-observability.ts), so
 * the AI entries below are a second line of defence: they censor user content, health data, and
 * credentials if a future change ever puts them into a log object by mistake.
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
  'idToken',
  'serviceToken',
  'token',
  'jwt',
  'bearer',
  'secret',
  'cookie',
  '*.password',
  '*.passwordHash',
  '*.currentPassword',
  '*.newPassword',
  '*.accessToken',
  '*.refreshToken',
  '*.idToken',
  '*.serviceToken',
  '*.token',
  '*.jwt',
  '*.bearer',
  '*.secret',
  '*.cookie',
  // AI credentials, health data, PII, and user content (messages, fitness context, images, audio, contact details).
  'apiKey',
  'authorization',
  'serviceSecret',
  'prompt',
  'rawPrompt',
  'systemPrompt',
  'userMessage',
  'message',
  'messages',
  'reply',
  'fitnessContext',
  'context',
  'memories',
  'notes',
  'medicalNote',
  'healthData',
  'diagnosis',
  'allergies',
  'medications',
  'query',
  'transcript',
  'base64',
  'imageBase64',
  'audioBase64',
  'email',
  'phone',
  'dob',
  'displayName',
  'sub',
  '*.apiKey',
  '*.authorization',
  '*.serviceSecret',
  '*.prompt',
  '*.rawPrompt',
  '*.systemPrompt',
  '*.userMessage',
  '*.message',
  '*.messages',
  '*.reply',
  '*.fitnessContext',
  '*.context',
  '*.memories',
  '*.notes',
  '*.medicalNote',
  '*.healthData',
  '*.diagnosis',
  '*.allergies',
  '*.medications',
  '*.query',
  '*.transcript',
  '*.base64',
  '*.imageBase64',
  '*.audioBase64',
  '*.email',
  '*.phone',
  '*.dob',
  '*.displayName',
  '*.sub',
];

const TEXT_REDACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/AIza[0-9A-Za-z_-]{20,}/g, '[redacted-api-key]'],
  [/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[redacted-secret-key]'],
  [/\bbearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]'],
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, '[redacted-jwt]'],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[redacted-email]'],
];

/** Redacts API keys, secret tokens, JWTs, and emails from arbitrary diagnostic strings. */
export function redactSensitiveText(text: string, maxLength = 200): string {
  let out = text.replace(/[\r\n]+/g, ' ').trim();
  for (const [pattern, replacement] of TEXT_REDACTIONS) {
    out = out.replace(pattern, replacement);
  }
  return out.slice(0, maxLength);
}

/** Formats an unknown error safely for internal logs without leaking credentials or PII. */
export function sanitizeErrorText(error: unknown, maxLength = 200): string {
  const raw = error instanceof Error ? error.message : String(error);
  return redactSensitiveText(raw, maxLength);
}

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
