import { describe, expect, it } from 'vitest';
import { AI_TIMEOUT_MESSAGE, AiTimeoutError, isAiTimeoutError } from '../../../src/shared/ai/ai-timeout.js';
import { AppError } from '../../../src/shared/errors/app-error.js';

describe('AiTimeoutError', () => {
  it('is a regular 503 SERVICE_UNAVAILABLE AppError with the one safe client message', () => {
    const error = new AiTimeoutError();

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ kind: 'unavailable', code: 'SERVICE_UNAVAILABLE', message: AI_TIMEOUT_MESSAGE });
    expect(AI_TIMEOUT_MESSAGE).toBe('AI request timed out. Please try again.');
  });

  it('is recognised by isAiTimeoutError and nothing else is', () => {
    expect(isAiTimeoutError(new AiTimeoutError())).toBe(true);
    expect(isAiTimeoutError(new AppError('unavailable', 'SERVICE_UNAVAILABLE', 'other'))).toBe(false);
    expect(isAiTimeoutError(new Error('timeout'))).toBe(false);
    expect(isAiTimeoutError(undefined)).toBe(false);
  });
});
