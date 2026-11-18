import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAdminApiError } from '../src/lib/error-normalizer';
import { ApiError } from '../src/lib/api-client';

describe('Admin Global Error Normalization & Handling', () => {
  it('1. maps network disconnect / offline to standardized user message', () => {
    const error1 = new TypeError('Failed to fetch');
    const norm1 = normalizeAdminApiError(error1);
    assert.equal(norm1.userMessage, 'Unable to connect. Check your internet connection.');
    assert.equal(norm1.isNetworkError, true);
    assert.equal(norm1.tone, 'error');

    const error2 = new Error('NetworkError when attempting to fetch resource');
    const norm2 = normalizeAdminApiError(error2);
    assert.equal(norm2.userMessage, 'Unable to connect. Check your internet connection.');
    assert.equal(norm2.isNetworkError, true);
  });

  it('2. maps timeout / abort to standardized timeout message', () => {
    const timeoutError = new Error('The operation was aborted due to timeout');
    timeoutError.name = 'TimeoutError';
    const norm = normalizeAdminApiError(timeoutError);
    assert.equal(norm.userMessage, 'Request timed out. Please try again.');
    assert.equal(norm.isTimeout, true);
    assert.equal(norm.tone, 'error');
  });

  it('3. maps 500-599 server errors to safe message without exposing internals', () => {
    const serverError = new ApiError('syntax error at or near "SELECT"', 500, 'INTERNAL_ERROR');
    const norm = normalizeAdminApiError(serverError);
    assert.equal(norm.userMessage, 'Something went wrong. Please try again.');
    assert.equal(norm.status, 500);
    assert.equal(norm.code, 'INTERNAL_ERROR');
    assert.equal(norm.tone, 'error');
  });

  it('4. maps 403 to permission denied message', () => {
    const forbidden = new ApiError('Forbidden resource', 403, 'FORBIDDEN');
    const norm = normalizeAdminApiError(forbidden);
    assert.equal(norm.userMessage, "You don't have permission to perform this action.");
    assert.equal(norm.status, 403);
    assert.equal(norm.tone, 'error');
  });

  it('5. maps 429 rate limit with warning tone and retry guidance', () => {
    const rateLimit = new ApiError('Too many requests', 429, 'RATE_LIMITED', { retryAfterSeconds: 30 });
    const norm = normalizeAdminApiError(rateLimit);
    assert.match(norm.userMessage, /Too many requests/);
    assert.match(norm.userMessage, /30s/);
    assert.equal(norm.status, 429);
    assert.equal(norm.tone, 'warning');
    assert.equal(norm.isRateLimit, true);
    assert.equal(norm.retryAfterSeconds, 30);
  });

  it('6. differentiates Gemini daily quota exhaustion from temporary throttling', () => {
    const quotaExhausted = new ApiError('Daily quota exceeded', 429, 'AI_QUOTA_EXCEEDED');
    const norm = normalizeAdminApiError(quotaExhausted);
    assert.match(norm.userMessage, /quota limit reached/);
    assert.equal(norm.code, 'AI_QUOTA_EXCEEDED');
    assert.equal(norm.tone, 'warning');
  });

  it('7. preserves structured validation details and field errors', () => {
    const validationError = new ApiError('The request is invalid.', 400, 'VALIDATION_FAILED', [
      { location: 'body', path: 'email', message: 'Email already exists' },
      { location: 'body', path: 'password', message: 'Password must be at least 12 characters' },
    ]);
    const norm = normalizeAdminApiError(validationError);
    assert.equal(norm.status, 400);
    assert.notEqual(norm.fieldErrors, undefined);
    assert.equal(norm.fieldErrors?.email, 'Email already exists');
    assert.equal(norm.fieldErrors?.password, 'Password must be at least 12 characters');
    assert.match(norm.userMessage, /Email already exists/);
  });

  it('8. deduplication logic enforces max 3 stack and drops duplicates within 2500ms', () => {
    const recentMap = new Map<string, number>();
    const toasts: Array<{ id: string; message: string; type: string }> = [];
    const MAX_STACKED = 3;
    const DEDUPE_MS = 2500;

    const add = (type: string, message: string) => {
      const now = Date.now();
      const key = `${type}:${message}`;
      const last = recentMap.get(key);
      if (last && now - last < DEDUPE_MS) {
        return null;
      }
      recentMap.set(key, now);

      const item = { id: `t-${now}-${Math.random()}`, message, type };
      if (toasts.length >= MAX_STACKED) {
        toasts.splice(0, toasts.length - (MAX_STACKED - 1));
      }
      toasts.push(item);
      return item;
    };

    const first = add('error', 'Unable to connect. Check your internet connection.');
    assert.notEqual(first, null);
    assert.equal(toasts.length, 1);

    // Duplicate call immediately
    const duplicate = add('error', 'Unable to connect. Check your internet connection.');
    assert.equal(duplicate, null, 'Duplicate message should be dropped');
    assert.equal(toasts.length, 1);

    // Different messages up to limit
    add('info', 'Message 2');
    add('warning', 'Message 3');
    assert.equal(toasts.length, 3);

    // Exceeding limit drops oldest
    add('success', 'Message 4');
    assert.equal(toasts.length, 3);
    assert.equal(toasts[0].message, 'Message 2');
    assert.equal(toasts[2].message, 'Message 4');
  });
});
