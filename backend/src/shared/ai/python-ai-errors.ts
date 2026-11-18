import { AppError } from '../errors/app-error.js';
import { AiTimeoutError } from './ai-timeout.js';
import type { PythonAiError } from './python-ai-client.js';

/**
 * Maps any failure of a Python AI call to the public error the API returns. Shared by every feature
 * served by the Python AI backend, so the mobile app sees the same error codes and shapes whichever
 * feature failed. Never exposes URLs, secrets or provider text.
 *
 * @param unavailableMessage user-facing text for failures of the AI backend itself (feature-specific wording)
 */
export function toPublicAiError(error: PythonAiError, unavailableMessage: string): AppError {
  const retryAfterSeconds = error.info.retryAfterSeconds;
  switch (error.kind) {
    case 'provider_rate_limited':
      return new AppError('rate_limited', 'RATE_LIMITED', error.message, { retryAfterSeconds });
    case 'provider_quota_exhausted':
      return new AppError('rate_limited', 'AI_QUOTA_EXCEEDED', error.message, {
        retryAfterSeconds,
        reason: 'QUOTA_EXHAUSTED_RPD',
      });
    case 'provider_unavailable':
      return new AppError(
        'unavailable',
        error.info.code === 'AI_UNAVAILABLE' ? 'AI_UNAVAILABLE' : 'SERVICE_UNAVAILABLE',
        error.message,
        retryAfterSeconds !== undefined ? { retryAfterSeconds } : undefined,
      );
    case 'provider_timeout':
    case 'timeout':
      return new AiTimeoutError();
    default:
      // unreachable, auth, misconfigured, invalid_request, invalid_response, server_error, provider_error
      return new AppError('unavailable', 'SERVICE_UNAVAILABLE', unavailableMessage);
  }
}
