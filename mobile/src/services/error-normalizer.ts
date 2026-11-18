/**
 * Standardized error normalizer for FitOnus Mobile.
 * Maps network, timeout, validation, server, and rate limit errors into user-friendly messages
 * while preserving structured codes and details for application logic.
 */

export interface NormalizedError {
  userMessage: string;
  status?: number | undefined;
  code?: string | undefined;
  tone: 'error' | 'warning' | 'info';
  retryAfterSeconds?: number | undefined;
  fieldErrors?: Record<string, string> | undefined;
  isNetworkError: boolean;
  isTimeout: boolean;
  isRateLimit: boolean;
}

export function normalizeMobileApiError(
  error: unknown,
  fallbackMessage = 'An unexpected error occurred.'
): NormalizedError {
  if (!error) {
    return {
      userMessage: fallbackMessage,
      tone: 'error',
      isNetworkError: false,
      isTimeout: false,
      isRateLimit: false,
    };
  }

  // Extract from AxiosError or custom error object
  const anyErr = error as {
    status?: number;
    code?: string;
    message?: string;
    name?: string;
    response?: {
      status?: number;
      data?: {
        message?: string;
        error?: {
          code?: string;
          message?: string;
          details?: unknown;
        };
      };
      headers?: Record<string, unknown>;
    };
    normalized?: NormalizedError;
  };

  // If already normalized, return it
  if (anyErr.normalized) {
    return anyErr.normalized;
  }

  const responseStatus = anyErr.response?.status;
  const status = typeof anyErr.status === 'number' ? anyErr.status : responseStatus;

  const backendError = anyErr.response?.data?.error;
  const code = backendError?.code || anyErr.code;
  const details = backendError?.details;
  const rawMessage = backendError?.message || anyErr.response?.data?.message || anyErr.message || '';

  // 1. Network failures (offline, connection refused, DNS lookup failure)
  const isNetwork =
    anyErr.code === 'ERR_NETWORK' ||
    anyErr.code === 'ECONNREFUSED' ||
    rawMessage === 'Network Error' ||
    rawMessage.includes('Network Error') ||
    rawMessage.includes('Failed to fetch') ||
    rawMessage.includes('fetch failed') ||
    code === 'NETWORK_ERROR';

  if (isNetwork && !status) {
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
    anyErr.code === 'ECONNABORTED' ||
    rawMessage.toLowerCase().includes('timeout') ||
    rawMessage.toLowerCase().includes('aborted') ||
    anyErr.name === 'AbortError' ||
    anyErr.name === 'TimeoutError' ||
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

  // 2.5. AI Provider Rate Limits / Overload (AI_UNAVAILABLE)
  if (code === 'AI_UNAVAILABLE') {
    let retryAfterSeconds: number | undefined;
    if (typeof details === 'object' && details !== null && 'retryAfterSeconds' in details) {
      retryAfterSeconds = Number((details as { retryAfterSeconds?: unknown }).retryAfterSeconds);
    }
    const waitMsg = retryAfterSeconds
      ? ` Please wait ${retryAfterSeconds}s and tap Try again.`
      : ' Please wait a moment and tap Try again.';

    return {
      userMessage: `The AI Coach is experiencing high demand right now.${waitMsg}`,
      status: status || 503,
      code: 'AI_UNAVAILABLE',
      tone: 'warning',
      retryAfterSeconds,
      isNetworkError: false,
      isTimeout: false,
      isRateLimit: true,
    };
  }

  // 3. HTTP 429 Rate Limits / Quota Exhaustion
  if (status === 429 || code === 'RATE_LIMITED' || code === 'AI_QUOTA_EXCEEDED') {
    let retryAfterSeconds: number | undefined;

    // From details
    if (typeof details === 'object' && details !== null && 'retryAfterSeconds' in details) {
      retryAfterSeconds = Number((details as { retryAfterSeconds?: unknown }).retryAfterSeconds);
    }

    // From response headers
    if (retryAfterSeconds === undefined && anyErr.response?.headers) {
      const headerVal =
        anyErr.response.headers['retry-after'] || anyErr.response.headers['Retry-After'];
      if (headerVal) {
        const sec = Number(headerVal);
        if (!Number.isNaN(sec)) {
          retryAfterSeconds = sec;
        }
      }
    }

    if (code === 'AI_QUOTA_EXCEEDED') {
      return {
        userMessage: 'AI coaching daily limit reached. Please try again tomorrow.',
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
      : ' Please slow down and try again shortly.';

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

  // 6. Domain Auth / Account Codes (EMAIL_TAKEN, INVALID_CREDENTIALS, PASSWORD_POLICY_VIOLATION)
  if (code === 'EMAIL_TAKEN') {
    return {
      userMessage: 'An account with this email address already exists. Please sign in.',
      status: status || 409,
      code,
      tone: 'error',
      fieldErrors: { email: 'An account with this email address already exists.' },
      isNetworkError: false,
      isTimeout: false,
      isRateLimit: false,
    };
  }

  if (code === 'INVALID_CREDENTIALS') {
    return {
      userMessage: 'Invalid email or password. Please try again.',
      status: status || 401,
      code,
      tone: 'error',
      isNetworkError: false,
      isTimeout: false,
      isRateLimit: false,
    };
  }

  if (code === 'PASSWORD_POLICY_VIOLATION') {
    return {
      userMessage: rawMessage || 'Password must be between 12 and 128 characters.',
      status: status || 400,
      code,
      tone: 'error',
      fieldErrors: { password: rawMessage || 'Password must be between 12 and 128 characters.' },
      isNetworkError: false,
      isTimeout: false,
      isRateLimit: false,
    };
  }

  // 7. HTTP 400 / 422 Validation Errors
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

    // Meaningful field errors or rawMessage
    let message = rawMessage;
    const firstKey = Object.keys(fieldErrors)[0];
    if (firstKey) {
      const fieldMsg = fieldErrors[firstKey];
      if (fieldMsg) {
        message = fieldMsg;
      }
    }

    const cleanMsg =
      message &&
      message !== 'The request is invalid.' &&
      !message.includes('[object Object]')
        ? message
        : 'Please check your input and try again.';

    return {
      userMessage: cleanMsg,
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
    !rawMessage.includes('[object Object]') &&
    !rawMessage.includes('Network Error')
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
