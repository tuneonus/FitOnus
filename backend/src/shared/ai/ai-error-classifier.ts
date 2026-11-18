/**
 * Classifies Gemini provider errors, determines quota scope,
 * extracts Retry-After delays, and produces safe, user-friendly messages.
 */

export type AiErrorKind =
  | 'RATE_LIMIT_RPM'
  | 'QUOTA_EXHAUSTED_RPD'
  | 'HIGH_DEMAND_503'
  | 'AUTH_ERROR'
  | 'MODEL_NOT_FOUND'
  | 'TIMEOUT'
  | 'UNKNOWN';

export interface ClassifiedAiError {
  kind: AiErrorKind;
  isRateLimited: boolean;
  isRetryable: boolean;
  isProjectWide: boolean;
  retryAfterSeconds: number;
  modelInvolved?: string;
  userFriendlyMessage: string;
  technicalReason: string;
}

export function classifyGeminiError(err: unknown): ClassifiedAiError {
  const errorMessage = err instanceof Error ? err.message : String(err);
  let parsedError: any = null;

  // Attempt to parse JSON error embedded in message or object
  try {
    if (typeof err === 'object' && err !== null && 'error' in err) {
      parsedError = (err as any).error;
    } else {
      const match = errorMessage.match(/\{[\s\S]*"error"[\s\S]*\}/);
      if (match) {
        const obj = JSON.parse(match[0]);
        parsedError = obj.error;
      }
    }
  } catch {
    parsedError = null;
  }

  // 1. Check for Authentication Errors
  if (
    errorMessage.includes('API_KEY_INVALID') ||
    errorMessage.includes('API key not valid') ||
    errorMessage.includes('401') ||
    errorMessage.includes('403') ||
    parsedError?.code === 401 ||
    parsedError?.code === 403
  ) {
    return {
      kind: 'AUTH_ERROR',
      isRateLimited: false,
      isRetryable: false,
      isProjectWide: true,
      retryAfterSeconds: 0,
      userFriendlyMessage: 'AI service configuration error. Please ensure credentials are valid.',
      technicalReason: 'Authentication failed (401/403/invalid key)',
    };
  }

  // 2. Check for Model Not Found / Deprecated
  if (
    errorMessage.includes('404') ||
    errorMessage.includes('NOT_FOUND') ||
    errorMessage.includes('no longer available') ||
    parsedError?.code === 404
  ) {
    return {
      kind: 'MODEL_NOT_FOUND',
      isRateLimited: false,
      isRetryable: true, // Retryable on fallback model!
      isProjectWide: false,
      retryAfterSeconds: 0,
      userFriendlyMessage: 'Configured AI model is unavailable. Switching to backup model.',
      technicalReason: 'Model not found or deprecated (404)',
    };
  }

  // 3. Check for Timeout Errors
  if (
    errorMessage.includes('timed out') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('DEADLINE_EXCEEDED')
  ) {
    return {
      kind: 'TIMEOUT',
      isRateLimited: false,
      isRetryable: false,
      isProjectWide: false,
      retryAfterSeconds: 5,
      userFriendlyMessage: 'AI request timed out. Please check your connection and try again.',
      technicalReason: 'Request deadline exceeded',
    };
  }

  // Extract retry delay from RetryInfo or message text if present
  let extractedRetrySeconds = 0;
  if (parsedError?.details && Array.isArray(parsedError.details)) {
    const retryInfo = parsedError.details.find(
      (d: any) => d['@type']?.includes('RetryInfo') || d.retryDelay,
    );
    if (retryInfo?.retryDelay) {
      const match = String(retryInfo.retryDelay).match(/^(\d+)s?$/);
      if (match) {
        extractedRetrySeconds = parseInt(match[1]!, 10);
      }
    }
  }

  // Also check regex in message for delay: e.g. "retry in 6h20m" or "Please retry in 20s"
  if (extractedRetrySeconds === 0) {
    const secMatch = errorMessage.match(/retry in (\d+)s/i) || errorMessage.match(/retry after (\d+)s/i);
    if (secMatch) {
      extractedRetrySeconds = parseInt(secMatch[1]!, 10);
    } else {
      const hrMinMatch = errorMessage.match(/retry in (?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/i);
      if (hrMinMatch && (hrMinMatch[1] || hrMinMatch[2] || hrMinMatch[3])) {
        const hrs = parseInt(hrMinMatch[1] || '0', 10);
        const mins = parseInt(hrMinMatch[2] || '0', 10);
        const secs = parseInt(hrMinMatch[3] || '0', 10);
        extractedRetrySeconds = hrs * 3600 + mins * 60 + secs;
      }
    }
  }

  // Check model dimension in violations
  let modelInvolved: string | undefined;
  let isModelSpecificQuota = false;
  if (parsedError?.details && Array.isArray(parsedError.details)) {
    const quotaFailure = parsedError.details.find(
      (d: any) => d['@type']?.includes('QuotaFailure') || d.violations,
    );
    if (quotaFailure?.violations && Array.isArray(quotaFailure.violations)) {
      for (const v of quotaFailure.violations) {
        if (v.quotaDimensions?.model) {
          modelInvolved = v.quotaDimensions.model;
          isModelSpecificQuota = true;
        }
      }
    }
  }

  // 4. Check for Rate Limit (429 / RESOURCE_EXHAUSTED)
  const is429 =
    errorMessage.includes('429') ||
    errorMessage.includes('RESOURCE_EXHAUSTED') ||
    errorMessage.includes('quota') ||
    errorMessage.includes('rate limit') ||
    parsedError?.code === 429 ||
    parsedError?.status === 'RESOURCE_EXHAUSTED';

  if (is429) {
    const isDaily =
      errorMessage.includes('requests per day') ||
      errorMessage.includes('per day limit exceeded') ||
      errorMessage.includes('GenerateRequestsPerDay') ||
      errorMessage.includes('free_tier_requests') ||
      (extractedRetrySeconds > 600); // More than 10 mins wait strongly indicates daily quota

    if (isDaily) {
      return {
        kind: 'QUOTA_EXHAUSTED_RPD',
        isRateLimited: true,
        // Rule: Do not treat model-specific daily limit as proof of project-wide exhaustion
        isRetryable: isModelSpecificQuota, // Eligible to test fallback model once if model-specific!
        isProjectWide: !isModelSpecificQuota,
        retryAfterSeconds: extractedRetrySeconds > 0 ? extractedRetrySeconds : 86400,
        modelInvolved,
        userFriendlyMessage: 'Daily AI Coach capacity has been reached. Please check back tomorrow.',
        technicalReason: `Daily quota limit exceeded (${modelInvolved ? `model: ${modelInvolved}` : 'project-wide'})`,
      };
    }

    // Default short-term RPM burst limit
    return {
      kind: 'RATE_LIMIT_RPM',
      isRateLimited: true,
      isRetryable: true,
      isProjectWide: false,
      retryAfterSeconds: extractedRetrySeconds > 0 ? extractedRetrySeconds : 25,
      modelInvolved,
      userFriendlyMessage: 'The AI Coach is experiencing high demand right now. Please wait a moment and try again.',
      technicalReason: `Per-minute rate limit reached (${modelInvolved ? `model: ${modelInvolved}` : 'RPM'})`,
    };
  }

  // 5. Check for 503 / High Demand / Overloaded
  if (
    errorMessage.includes('503') ||
    errorMessage.includes('UNAVAILABLE') ||
    errorMessage.includes('overloaded') ||
    errorMessage.includes('high demand') ||
    parsedError?.code === 503 ||
    parsedError?.status === 'UNAVAILABLE'
  ) {
    return {
      kind: 'HIGH_DEMAND_503',
      isRateLimited: false,
      isRetryable: true,
      isProjectWide: false,
      retryAfterSeconds: extractedRetrySeconds > 0 ? extractedRetrySeconds : 15,
      userFriendlyMessage: 'AI Coach is momentarily busy with peak demand. Please try again shortly.',
      technicalReason: 'Service overloaded or unavailable (503)',
    };
  }

  // 6. Unknown / Generic Provider Failure
  return {
    kind: 'UNKNOWN',
    isRateLimited: false,
    isRetryable: false,
    isProjectWide: false,
    retryAfterSeconds: 5,
    userFriendlyMessage: 'AI service is temporarily unavailable. Please try again.',
    technicalReason: errorMessage,
  };
}
