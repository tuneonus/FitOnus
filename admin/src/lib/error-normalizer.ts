/**
 * Standardized error normalizer for FitOnus Admin.
 * Maps network, timeout, validation, server, and rate limit errors into user-friendly messages
 * while preserving structured codes and details for application logic.
 */

export interface NormalizedError {
  userMessage: string;
  status?: number;
  code?: string;
  tone: 'error' | 'warning' | 'info';
  retryAfterSeconds?: number;
  fieldErrors?: Record<string, string>;
  isNetworkError: boolean;
  isTimeout: boolean;
  isRateLimit: boolean;
}

export function normalizeAdminApiError(error: unknown, fallbackMessage = 'An unexpected error occurred.'): NormalizedError {
  if (!error) {
    return {
      userMessage: fallbackMessage,
      tone: 'error',
      isNetworkError: false,
      isTimeout: false,
      isRateLimit: false,
    };
  }

  // Check if it's already an ApiError or has response data
  const status = (error as { status?: number })?.status;
  const code = (error as { code?: string })?.code;
  const details = (error as { details?: unknown })?.details;
  const rawMessage = (error as { message?: string })?.message || '';

  // 1. Network failures (offline, connection refused, DNS lookup failure)
  const isNetwork =
    rawMessage.includes('Failed to fetch') ||
    rawMessage.includes('fetch failed') ||
    rawMessage.includes('NetworkError') ||
    (typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.onLine === false) ||
    code === 'NETWORK_ERROR';

  if (isNetwork) {
    return {
      userMessage: 'Unable to connect. Check your internet connection.',
      code: 'NETWORK_ERROR',
      tone: 'error',
      isNetworkError: true,
      isTimeout: false,
      isRateLimit: false,
    };
  }

  // 2. Timeouts
  const isTimeout =
    rawMessage.includes('aborted') ||
    rawMessage.includes('timeout') ||
    (error as { name?: string })?.name === 'AbortError' ||
    (error as { name?: string })?.name === 'TimeoutError' ||
    code === 'TIMEOUT';

  if (isTimeout) {
    return {
      userMessage: 'Request timed out. Please try again.',
      code: 'TIMEOUT',
      tone: 'error',
      isNetworkError: false,
      isTimeout: true,
      isRateLimit: false,
    };
  }

  // 3. HTTP 429 Rate Limits / Quota Exhaustion
  if (status === 429 || code === 'RATE_LIMITED' || code === 'AI_QUOTA_EXCEEDED') {
    let retryAfterSeconds: number | undefined;
    if (typeof details === 'object' && details !== null && 'retryAfterSeconds' in details) {
      retryAfterSeconds = Number((details as { retryAfterSeconds?: unknown }).retryAfterSeconds);
    }

    if (code === 'AI_QUOTA_EXCEEDED') {
      return {
        userMessage: 'AI provider quota limit reached. Please wait for the daily quota to reset.',
        status: 429,
        code: 'AI_QUOTA_EXCEEDED',
        tone: 'warning',
        retryAfterSeconds,
        isNetworkError: false,
        isTimeout: false,
        isRateLimit: true,
      };
    }

    const waitMsg = retryAfterSeconds
      ? ` Please try again in ${retryAfterSeconds}s.`
      : ' Please try again shortly.';

    return {
      userMessage: `Too many requests.${waitMsg}`,
      status: 429,
      code: code || 'RATE_LIMITED',
      tone: 'warning',
      retryAfterSeconds,
      isNetworkError: false,
      isTimeout: false,
      isRateLimit: true,
    };
  }

  // 4. HTTP 403 Forbidden
  if (status === 403 || code === 'FORBIDDEN') {
    return {
      userMessage: "You don't have permission to perform this action.",
      status: 403,
      code: 'FORBIDDEN',
      tone: 'error',
      isNetworkError: false,
      isTimeout: false,
      isRateLimit: false,
    };
  }

  // 5. HTTP 500-599 Server Errors
  if (status && status >= 500 && status <= 599) {
    return {
      userMessage: 'Something went wrong. Please try again.',
      status,
      code: code || 'INTERNAL_ERROR',
      tone: 'error',
      isNetworkError: false,
      isTimeout: false,
      isRateLimit: false,
    };
  }

  // 6. HTTP 400 / 422 Validation Errors
  if (status === 400 || status === 422) {
    const fieldErrors: Record<string, string> = {};
    if (Array.isArray(details)) {
      for (const item of details) {
        if (item && typeof item === 'object' && 'path' in item && 'message' in item) {
          const path = String(item.path);
          if (!fieldErrors[path]) {
            fieldErrors[path] = String(item.message);
          }
        }
      }
    }

    // Preserve meaningful backend message (e.g. Email already exists, Invalid credentials)
    let message = rawMessage;
    if (Object.keys(fieldErrors).length > 0) {
      const firstField = Object.keys(fieldErrors)[0];
      message = `${firstField}: ${fieldErrors[firstField]}`;
    }

    return {
      userMessage: message || 'The request could not be processed. Please check your input.',
      status,
      code: code || 'VALIDATION_FAILED',
      tone: 'error',
      fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
      isNetworkError: false,
      isTimeout: false,
      isRateLimit: false,
    };
  }

  // Default fallback for client-side exceptions or other statuses (404, 409, etc.)
  const cleanMessage =
    rawMessage &&
    !rawMessage.includes('status code 5') &&
    !rawMessage.includes('[object Object]')
      ? rawMessage
      : fallbackMessage;

  return {
    userMessage: cleanMessage,
    status,
    code,
    tone: 'error',
    isNetworkError: false,
    isTimeout: false,
    isRateLimit: false,
  };
}
