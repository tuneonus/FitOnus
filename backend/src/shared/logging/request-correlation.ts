import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The correlation id ties every log line of ONE user request together: the HTTP access line, the AI
 * events, and (through the `X-Correlation-Id` header) the Python AI backend's lines. It is the same
 * value as pino-http's `req.id`, the `X-Request-Id` response header the app receives, and the
 * `requestId` in the error envelope, so a user can quote one id and support can find everything.
 *
 * It lives in AsyncLocalStorage (like the AI usage context) so deep code such as the Python AI client
 * can read it without every use case and port having to pass it along.
 */
const storage = new AsyncLocalStorage<{ readonly correlationId: string }>();

/** Ids we accept from outside (a client's X-Request-Id) or put into a header ourselves. */
export const SAFE_CORRELATION_ID = /^[A-Za-z0-9._-]{8,128}$/;

export const isSafeCorrelationId = (value: unknown): value is string =>
  typeof value === 'string' && SAFE_CORRELATION_ID.test(value);

export const runWithCorrelationId = <T>(correlationId: string, work: () => T): T =>
  storage.run({ correlationId }, work);

/** The current request's correlation id, or undefined outside an HTTP request (jobs, some tests). */
export const currentCorrelationId = (): string | undefined => storage.getStore()?.correlationId;
