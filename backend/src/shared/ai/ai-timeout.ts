import { AppError } from '../errors/app-error.js';

/** The only text a client ever sees for a provider timeout. Nothing about the provider leaks. */
export const AI_TIMEOUT_MESSAGE = 'AI request timed out. Please try again.';

/**
 * A provider call exceeded its deadline. It is a regular `unavailable` / `SERVICE_UNAVAILABLE`
 * AppError (HTTP 503), so existing handlers and clients treat it like any other transient AI failure;
 * the subclass only lets telemetry tell a timeout apart from other provider errors.
 */
export class AiTimeoutError extends AppError {
  constructor() {
    super('unavailable', 'SERVICE_UNAVAILABLE', AI_TIMEOUT_MESSAGE);
  }
}

export const isAiTimeoutError = (error: unknown): error is AiTimeoutError => error instanceof AiTimeoutError;
