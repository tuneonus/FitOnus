import type { AiMetricsSnapshot } from './ai-metrics.js';

export interface AiSloThresholds {
  readonly minSamples: number;
  readonly warnErrorRate: number;
  readonly criticalErrorRate: number;
  readonly warnTimeoutRate: number;
  readonly criticalTimeoutRate: number;
  readonly warnFallbackRate: number;
  readonly criticalFallbackRate: number;
  readonly warnChatP95Ms: number;
  readonly criticalChatP95Ms: number;
  readonly warnMultimodalP95Ms: number;
  readonly criticalMultimodalP95Ms: number;
  readonly warnRagP95Ms: number;
  readonly criticalRagP95Ms: number;
  readonly warnRagEmptyRate: number;
  readonly criticalRagEmptyRate: number;
  readonly warnAgentLimitHitRate: number;
  readonly criticalAgentLimitHitRate: number;
  readonly criticalQuotaExhaustedCount: number;
  readonly criticalAuthFailureCount: number;
  readonly warnUnavailableCount: number;
  readonly criticalUnavailableCount: number;
}

export const DEFAULT_AI_SLO_THRESHOLDS: AiSloThresholds = {
  minSamples: 10,
  warnErrorRate: 0.05,
  criticalErrorRate: 0.15,
  warnTimeoutRate: 0.05,
  criticalTimeoutRate: 0.15,
  warnFallbackRate: 0.15,
  criticalFallbackRate: 0.4,
  warnChatP95Ms: 8_000,
  criticalChatP95Ms: 15_000,
  warnMultimodalP95Ms: 12_000,
  criticalMultimodalP95Ms: 20_000,
  warnRagP95Ms: 500,
  criticalRagP95Ms: 1_500,
  warnRagEmptyRate: 0.35,
  criticalRagEmptyRate: 0.6,
  warnAgentLimitHitRate: 0.15,
  criticalAgentLimitHitRate: 0.35,
  criticalQuotaExhaustedCount: 1,
  criticalAuthFailureCount: 1,
  warnUnavailableCount: 3,
  criticalUnavailableCount: 10,
};

export interface OperationalAlert {
  readonly severity: 'warning' | 'critical';
  readonly code: string;
  readonly metric: string;
  readonly observed: number;
  readonly threshold: number;
  readonly action: string;
}

export interface OperationalHealthEvaluation {
  readonly status: 'healthy' | 'degraded' | 'critical';
  readonly alerts: readonly OperationalAlert[];
  readonly summary: {
    readonly totalRequests: number;
    readonly failureRate: number;
    readonly fallbackRate: number;
    readonly estimatedCostUsd: number;
  };
}

/** Evaluates a metrics snapshot against operational SLO thresholds for alerting and triage. */
export function evaluateAiOperationalHealth(
  snapshot: AiMetricsSnapshot,
  thresholds: AiSloThresholds = DEFAULT_AI_SLO_THRESHOLDS,
): OperationalHealthEvaluation {
  const alerts: OperationalAlert[] = [];
  const { ai, rag, agent } = snapshot;
  const errors = ai.errorsByCategory;

  const push = (alert: OperationalAlert): void => {
    alerts.push(alert);
  };

  // Immediate billing, auth, and availability checks (zero min-sample threshold)
  const quotaExhausted = errors['gemini_quota_exhausted'] ?? 0;
  if (quotaExhausted >= thresholds.criticalQuotaExhaustedCount) {
    push({
      severity: 'critical',
      code: 'QUOTA_EXHAUSTED',
      metric: 'ai.errors.gemini_quota_exhausted',
      observed: quotaExhausted,
      threshold: thresholds.criticalQuotaExhaustedCount,
      action: 'Verify Google Cloud / Gemini daily quota and billing limits immediately.',
    });
  }

  const authErrors = (errors['gemini_auth'] ?? 0) + (errors['auth_failure'] ?? 0);
  if (authErrors >= thresholds.criticalAuthFailureCount) {
    push({
      severity: 'critical',
      code: 'AUTH_CONFIGURATION_FAILURE',
      metric: 'ai.errors.auth_total',
      observed: authErrors,
      threshold: thresholds.criticalAuthFailureCount,
      action: 'Verify GEMINI_API_KEY and AI_BACKEND_SERVICE_SECRET / AI_SERVICE_JWT_SECRET parity.',
    });
  }

  const unavailable = (errors['python_unavailable'] ?? 0) + (errors['gemini_unavailable'] ?? 0);
  if (unavailable >= thresholds.criticalUnavailableCount) {
    push({
      severity: 'critical',
      code: 'SERVICE_AVAILABILITY_CRITICAL',
      metric: 'ai.errors.unavailable_total',
      observed: unavailable,
      threshold: thresholds.criticalUnavailableCount,
      action: 'Check ai-backend /health/live, Render worker health, and upstream Gemini status.',
    });
  } else if (unavailable >= thresholds.warnUnavailableCount) {
    push({
      severity: 'warning',
      code: 'SERVICE_AVAILABILITY_DEGRADED',
      metric: 'ai.errors.unavailable_total',
      observed: unavailable,
      threshold: thresholds.warnUnavailableCount,
      action: 'Monitor upstream provider 503 responses and ai-backend cold starts.',
    });
  }

  // Sample-gated reliability & rate metrics
  if (ai.totalRequests >= thresholds.minSamples) {
    if (ai.failureRate >= thresholds.criticalErrorRate) {
      push({
        severity: 'critical',
        code: 'HIGH_AI_ERROR_RATE',
        metric: 'ai.failureRate',
        observed: ai.failureRate,
        threshold: thresholds.criticalErrorRate,
        action: 'Inspect dominant errorCategory in structured logs and mitigate failing dependency.',
      });
    } else if (ai.failureRate >= thresholds.warnErrorRate) {
      push({
        severity: 'warning',
        code: 'ELEVATED_AI_ERROR_RATE',
        metric: 'ai.failureRate',
        observed: ai.failureRate,
        threshold: thresholds.warnErrorRate,
        action: 'Review recent ai.call.failed logs for transient upstream failures.',
      });
    }

    if (ai.timeoutRate >= thresholds.criticalTimeoutRate) {
      push({
        severity: 'critical',
        code: 'HIGH_TIMEOUT_RATE',
        metric: 'ai.timeoutRate',
        observed: ai.timeoutRate,
        threshold: thresholds.criticalTimeoutRate,
        action: 'Check Gemini deadline budgets and ai-backend responsiveness.',
      });
    } else if (ai.timeoutRate >= thresholds.warnTimeoutRate) {
      push({
        severity: 'warning',
        code: 'ELEVATED_TIMEOUT_RATE',
        metric: 'ai.timeoutRate',
        observed: ai.timeoutRate,
        threshold: thresholds.warnTimeoutRate,
        action: 'Inspect model attempt latency and prompt sizes.',
      });
    }

    if (ai.fallbackRate >= thresholds.criticalFallbackRate) {
      push({
        severity: 'critical',
        code: 'HIGH_FALLBACK_RATE',
        metric: 'ai.fallbackRate',
        observed: ai.fallbackRate,
        threshold: thresholds.criticalFallbackRate,
        action: 'Primary Gemini model is degraded/cooling down; verify RPM limits.',
      });
    } else if (ai.fallbackRate >= thresholds.warnFallbackRate) {
      push({
        severity: 'warning',
        code: 'ELEVATED_FALLBACK_RATE',
        metric: 'ai.fallbackRate',
        observed: ai.fallbackRate,
        threshold: thresholds.warnFallbackRate,
        action: 'Monitor primary model cooldown events and backup model quality.',
      });
    }
  }

  // Feature p95 latency SLOs
  for (const chatFeat of ['coach_chat', 'coach_insights', 'coach_agent'] as const) {
    const feat = ai.byFeature[chatFeat];
    if (feat && feat.requests >= thresholds.minSamples) {
      if (feat.latency.p95Ms >= thresholds.criticalChatP95Ms) {
        push({
          severity: 'critical',
          code: 'CHAT_LATENCY_CRITICAL',
          metric: `ai.${chatFeat}.p95Ms`,
          observed: feat.latency.p95Ms,
          threshold: thresholds.criticalChatP95Ms,
          action: 'Profile context assembly, RAG, and model spans; tighten context budgets.',
        });
      } else if (feat.latency.p95Ms >= thresholds.warnChatP95Ms) {
        push({
          severity: 'warning',
          code: 'CHAT_LATENCY_WARN',
          metric: `ai.${chatFeat}.p95Ms`,
          observed: feat.latency.p95Ms,
          threshold: thresholds.warnChatP95Ms,
          action: 'Review p95 latency contributors in distributed trace spans.',
        });
      }
    }
  }

  for (const mmFeat of ['meal_photo', 'voice_meal', 'transcribe'] as const) {
    const feat = ai.byFeature[mmFeat];
    if (feat && feat.requests >= thresholds.minSamples) {
      if (feat.latency.p95Ms >= thresholds.criticalMultimodalP95Ms) {
        push({
          severity: 'critical',
          code: 'MULTIMODAL_LATENCY_CRITICAL',
          metric: `ai.${mmFeat}.p95Ms`,
          observed: feat.latency.p95Ms,
          threshold: thresholds.criticalMultimodalP95Ms,
          action: 'Multimodal p95 approaching mobile 25-30s timeout.',
        });
      } else if (feat.latency.p95Ms >= thresholds.warnMultimodalP95Ms) {
        push({
          severity: 'warning',
          code: 'MULTIMODAL_LATENCY_WARN',
          metric: `ai.${mmFeat}.p95Ms`,
          observed: feat.latency.p95Ms,
          threshold: thresholds.warnMultimodalP95Ms,
          action: 'Inspect media payload sizes and Gemini multimodal latency.',
        });
      }
    }
  }

  // RAG quality & latency SLOs
  for (const [mode, stats] of Object.entries(rag)) {
    if (stats.retrievals >= thresholds.minSamples) {
      if (stats.emptyRate >= thresholds.criticalRagEmptyRate) {
        push({
          severity: 'critical',
          code: 'RAG_EMPTY_RATE_CRITICAL',
          metric: `rag.${mode}.emptyRate`,
          observed: stats.emptyRate,
          threshold: thresholds.criticalRagEmptyRate,
          action: 'Check active knowledge documents, pgvector index health, and similarity cutoff.',
        });
      } else if (stats.emptyRate >= thresholds.warnRagEmptyRate) {
        push({
          severity: 'warning',
          code: 'RAG_EMPTY_RATE_WARN',
          metric: `rag.${mode}.emptyRate`,
          observed: stats.emptyRate,
          threshold: thresholds.warnRagEmptyRate,
          action: 'Audit RAG query routing and minSimilarity thresholds.',
        });
      }

      if (stats.latency.p95Ms >= thresholds.criticalRagP95Ms) {
        push({
          severity: 'critical',
          code: 'RAG_LATENCY_CRITICAL',
          metric: `rag.${mode}.p95Ms`,
          observed: stats.latency.p95Ms,
          threshold: thresholds.criticalRagP95Ms,
          action: 'Investigate pgvector HNSW index latency and embedding call latency.',
        });
      } else if (stats.latency.p95Ms >= thresholds.warnRagP95Ms) {
        push({
          severity: 'warning',
          code: 'RAG_LATENCY_WARN',
          metric: `rag.${mode}.p95Ms`,
          observed: stats.latency.p95Ms,
          threshold: thresholds.warnRagP95Ms,
          action: 'Inspect hybrid retrieval candidate sizes and DB statement latency.',
        });
      }
    }
  }

  // Agent limit-hit SLOs
  for (const [engine, stats] of Object.entries(agent.byEngine)) {
    if (stats.executions >= thresholds.minSamples) {
      const limitRate = Math.round((stats.limitHits / stats.executions) * 10_000) / 10_000;
      if (limitRate >= thresholds.criticalAgentLimitHitRate) {
        push({
          severity: 'critical',
          code: 'AGENT_LIMIT_HIT_CRITICAL',
          metric: `agent.${engine}.limitHitRate`,
          observed: limitRate,
          threshold: thresholds.criticalAgentLimitHitRate,
          action: 'Review agent iteration/tool budgets and loop termination triggers.',
        });
      } else if (limitRate >= thresholds.warnAgentLimitHitRate) {
        push({
          severity: 'warning',
          code: 'AGENT_LIMIT_HIT_WARN',
          metric: `agent.${engine}.limitHitRate`,
          observed: limitRate,
          threshold: thresholds.warnAgentLimitHitRate,
          action: 'Monitor agent step budgets and tool latency.',
        });
      }
    }
  }

  const hasCritical = alerts.some((a) => a.severity === 'critical');
  const status = hasCritical ? 'critical' : alerts.length > 0 ? 'degraded' : 'healthy';

  return {
    status,
    alerts,
    summary: {
      totalRequests: ai.totalRequests,
      failureRate: ai.failureRate,
      fallbackRate: ai.fallbackRate,
      estimatedCostUsd: ai.estimatedCostUsd,
    },
  };
}
