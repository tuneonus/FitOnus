import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeMobileApiError,
  type NormalizedError,
} from '../src/services/error-normalizer';
import { useToastStore, showToast, showToastFromError } from '../src/shared/stores/toastStore';
import { shouldRetryQuery } from '../src/providers/query-provider';
import { extractApiErrorMessage } from '../src/features/auth/services/auth-service';

describe('Mobile Global Error Handling & Normalization Architecture', () => {
  beforeEach(() => {
    useToastStore.getState().clear();
  });

  // 1. Network Errors
  it('1. maps network failure / offline to concise standardized message', () => {
    const axiosNetworkError = {
      message: 'Network Error',
      code: 'ERR_NETWORK',
      isAxiosError: true,
    };

    const normalized = normalizeMobileApiError(axiosNetworkError);
    assert.equal(normalized.userMessage, 'Unable to connect. Check your internet connection.');
    assert.equal(normalized.isNetworkError, true);
    assert.equal(normalized.isTimeout, false);
    assert.equal(normalized.isRateLimit, false);
    assert.equal(normalized.tone, 'error');
    assert.equal(normalized.code, 'NETWORK_ERROR');
  });

  // 2. Timeouts
  it('2. maps timeout / abort to standardized timeout message', () => {
    const timeoutError = {
      message: 'timeout of 60000ms exceeded',
      code: 'ECONNABORTED',
      name: 'AxiosError',
    };

    const normalized = normalizeMobileApiError(timeoutError);
    assert.equal(normalized.userMessage, 'Request timed out. Please try again.');
    assert.equal(normalized.isTimeout, true);
    assert.equal(normalized.isNetworkError, false);
    assert.equal(normalized.tone, 'error');
    assert.equal(normalized.code, 'TIMEOUT');
  });

  // 3. HTTP 500-599 Server Errors
  it('3. maps 500-599 server errors to safe message without exposing internals or stack traces', () => {
    const internalError = {
      response: {
        status: 500,
        data: {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Database query failed: syntax error at or near "SELECT * FROM users"',
            details: 'Postgres Error Code: 42601\n    at pgClient.query (pg.js:14)',
          },
        },
      },
    };

    const normalized = normalizeMobileApiError(internalError);
    assert.equal(normalized.userMessage, 'Something went wrong. Please try again.');
    assert.equal(normalized.status, 500);
    assert.equal(normalized.tone, 'error');
    assert.equal(normalized.code, 'INTERNAL_ERROR');
    // Ensure raw SQL and stack traces are NOT in userMessage
    assert.ok(!normalized.userMessage.includes('SELECT'));
    assert.ok(!normalized.userMessage.includes('Postgres'));
  });

  // 4. HTTP 403 Forbidden
  it('4. maps 403 to permission denied message', () => {
    const forbiddenError = {
      response: {
        status: 403,
        data: {
          error: {
            code: 'FORBIDDEN',
            message: 'Forbidden resource',
          },
        },
      },
    };

    const normalized = normalizeMobileApiError(forbiddenError);
    assert.equal(normalized.userMessage, "You don't have permission to perform this action.");
    assert.equal(normalized.status, 403);
    assert.equal(normalized.tone, 'error');
  });

  // 5. HTTP 429 Rate Limits
  it('5. maps 429 rate limit with warning tone and retry guidance', () => {
    const rateLimitError = {
      response: {
        status: 429,
        data: {
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests',
            details: { retryAfterSeconds: 25 },
          },
        },
      },
    };

    const normalized = normalizeMobileApiError(rateLimitError);
    assert.equal(normalized.userMessage, 'Too many requests. Please try again in 25s.');
    assert.equal(normalized.status, 429);
    assert.equal(normalized.tone, 'warning');
    assert.equal(normalized.retryAfterSeconds, 25);
    assert.equal(normalized.isRateLimit, true);
  });

  // 6. Gemini Daily Quota Exhaustion
  it('6. differentiates Gemini daily quota exhaustion from temporary throttling', () => {
    const quotaError = {
      response: {
        status: 429,
        data: {
          error: {
            code: 'AI_QUOTA_EXCEEDED',
            message: 'Resource has been exhausted (e.g. check quota).',
          },
        },
      },
    };

    const normalized = normalizeMobileApiError(quotaError);
    assert.equal(normalized.userMessage, 'AI coaching daily limit reached. Please try again tomorrow.');
    assert.equal(normalized.status, 429);
    assert.equal(normalized.code, 'AI_QUOTA_EXCEEDED');
    assert.equal(normalized.tone, 'warning');
    assert.equal(normalized.isRateLimit, true);
  });

  // 7. Validation Errors & Field-Level Preservation
  it('7. preserves structured validation details and field errors without exposing raw Zod formatting', () => {
    const validationError = {
      response: {
        status: 422,
        data: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'The request is invalid.',
            details: [
              { path: 'email', message: 'Invalid email address' },
              { path: 'password', message: 'Password must be between 12 and 128 characters' },
            ],
          },
        },
      },
    };

    const normalized = normalizeMobileApiError(validationError);
    assert.equal(normalized.status, 422);
    assert.equal(normalized.tone, 'error');
    assert.deepEqual(normalized.fieldErrors, {
      email: 'Invalid email address',
      password: 'Password must be between 12 and 128 characters',
    });
    // First field error presented clearly
    assert.equal(normalized.userMessage, 'Invalid email address');
  });

  it('7b. preserves specific domain auth error codes (EMAIL_TAKEN, PASSWORD_POLICY_VIOLATION)', () => {
    const emailTakenError = {
      response: {
        status: 409,
        data: {
          error: {
            code: 'EMAIL_TAKEN',
            message: 'Email already exists',
          },
        },
      },
    };

    const normalized = normalizeMobileApiError(emailTakenError);
    assert.equal(normalized.userMessage, 'An account with this email address already exists. Please sign in.');
  });

  // 8. Toast Store Deduplication & Max 3 Stacking
  it('8. deduplicates identical toast within window and enforces max 3 stacked toasts', () => {
    const store = useToastStore.getState();

    // Trigger same toast 3 times quickly
    showToast({ message: 'Saved successfully', tone: 'success' });
    showToast({ message: 'Saved successfully', tone: 'success' });
    showToast({ message: 'Saved successfully', tone: 'success' });

    assert.equal(useToastStore.getState().toasts.length, 1);
    assert.equal(useToastStore.getState().toasts[0]?.message, 'Saved successfully');

    // Trigger distinct toasts to test max 3 stacking
    showToast({ message: 'Toast 2', tone: 'info' });
    showToast({ message: 'Toast 3', tone: 'warning' });
    assert.equal(useToastStore.getState().toasts.length, 3);

    // 4th distinct toast drops oldest to maintain maximum 3
    showToast({ message: 'Toast 4', tone: 'error' });
    const current = useToastStore.getState().toasts;
    assert.equal(current.length, 3);
    assert.equal(current[0]?.message, 'Toast 2');
    assert.equal(current[1]?.message, 'Toast 3');
    assert.equal(current[2]?.message, 'Toast 4');
  });

  it('8b. sanitizes undefined, [object Object], and raw Axios strings in toasts', () => {
    showToast({ message: '[object Object]' });
    const t1 = useToastStore.getState().toasts[0];
    assert.equal(t1?.message, 'Something went wrong. Please try again.');

    useToastStore.getState().clear();
    showToast({ message: 'Network Error' });
    const t2 = useToastStore.getState().toasts[0];
    assert.equal(t2?.message, 'Unable to connect. Check your internet connection.');

    useToastStore.getState().clear();
    showToast({ message: 'Request failed with status code 503' });
    const t3 = useToastStore.getState().toasts[0];
    assert.equal(t3?.message, 'Something went wrong. Please try again.');
  });

  // 9. React Query Smart Retry Logic
  it('9. shouldRetryQuery never retries 400, 401, 403, 404, 409, 422, or 429', () => {
    const nonRetryableStatuses = [400, 401, 403, 404, 409, 422, 429];

    for (const status of nonRetryableStatuses) {
      const err = { status };
      const canRetry = shouldRetryQuery(0, err);
      assert.equal(canRetry, false, `Status ${status} should not be retried`);
    }

    // AI Quota Exceeded should not be retried
    const quotaErr = { normalized: { code: 'AI_QUOTA_EXCEEDED', isRateLimit: true } };
    assert.equal(shouldRetryQuery(0, quotaErr), false);

    // Transient 503 or network failure allows retry if failureCount < 2
    const networkErr = { status: 503 };
    assert.equal(shouldRetryQuery(0, networkErr), true);
    assert.equal(shouldRetryQuery(1, networkErr), true);
    assert.equal(shouldRetryQuery(2, networkErr), false);
  });

  // 10. Auth Service Message Extraction
  it('10. extractApiErrorMessage formats errors cleanly for auth screens', () => {
    const networkErr = { message: 'Network Error', code: 'ERR_NETWORK' };
    const extractedNet = extractApiErrorMessage(networkErr, 'Fallback');
    assert.equal(extractedNet, 'Unable to connect. Check your internet connection.');

    const serverErr = { response: { status: 500, data: { message: 'Internal Server Error' } } };
    const extractedServer = extractApiErrorMessage(serverErr, 'Fallback');
    assert.equal(extractedServer, 'Something went wrong. Please try again.');

    const timeoutErr = { code: 'ECONNABORTED', message: 'timeout of 10000ms exceeded' };
    const extractedTimeout = extractApiErrorMessage(timeoutErr, 'Fallback');
    assert.equal(extractedTimeout, 'Request timed out. Please try again.');
  });

  // 11. AI Coach Error Lifecycle & Preservation
  it('11. preserves user message and sets friendly error state on AI coach failure', async () => {
    const { useCoachStore } = await import('../src/features/ai-coach/store/coachStore');
    const { CoachApi } = await import('../src/features/ai-coach/services/coach-api');

    useCoachStore.getState().newConversation();

    // Mock failure
    const originalSendMessage = CoachApi.sendMessage;
    CoachApi.sendMessage = async () => {
      const err: any = new Error('Resource has been exhausted');
      err.response = {
        status: 429,
        data: {
          error: {
            code: 'AI_QUOTA_EXCEEDED',
            message: 'Resource has been exhausted',
          },
        },
      };
      throw err;
    };

    try {
      useCoachStore.getState().send('What should I eat for dinner?');

      // Wait a tick for async sendToApi to finish
      await new Promise((r) => setTimeout(r, 50));

      const messages = useCoachStore.getState().messages;
      assert.equal(messages.length, 2);

      // User message is preserved
      assert.equal(messages[0]?.role, 'user');
      assert.equal(messages[0]?.text, 'What should I eat for dinner?');
      assert.equal(messages[0]?.status, 'done');

      // Assistant message is friendly error (never raw technical jargon)
      assert.equal(messages[1]?.role, 'assistant');
      assert.equal(messages[1]?.status, 'error');
      assert.equal(messages[1]?.text, 'AI coaching daily limit reached. Please try again tomorrow.');

      // Speech synthesis is NOT active
      assert.equal(useCoachStore.getState().speakingMessageId, null);

      // Retry without duplicate user message
      CoachApi.sendMessage = async () => ({
        text: 'Eat grilled salmon with broccoli and sweet potato.',
        conversationId: 'convo-1',
      });

      const assistantId = messages[1]!.id;
      useCoachStore.getState().retry(assistantId);

      await new Promise((r) => setTimeout(r, 50));

      const updatedMessages = useCoachStore.getState().messages;
      // Still exactly 2 messages: user message was not duplicated
      assert.equal(updatedMessages.length, 2);
      assert.equal(updatedMessages[1]?.status, 'done');
      assert.equal(updatedMessages[1]?.text, 'Eat grilled salmon with broccoli and sweet potato.');
    } finally {
      CoachApi.sendMessage = originalSendMessage;
    }
  });
});
