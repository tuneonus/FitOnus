"""Operational SLO thresholds and automated health evaluator for FitOnus AI observability."""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class SloThresholds:
    """Actionable alert thresholds calibrated to FitOnus Node/Python timeouts and quotas."""

    min_samples: int = 10
    warn_error_rate: float = 0.05
    critical_error_rate: float = 0.15
    warn_timeout_rate: float = 0.05
    critical_timeout_rate: float = 0.15
    warn_fallback_rate: float = 0.15
    critical_fallback_rate: float = 0.40
    warn_chat_p95_ms: float = 8_000.0
    critical_chat_p95_ms: float = 15_000.0
    warn_multimodal_p95_ms: float = 12_000.0
    critical_multimodal_p95_ms: float = 20_000.0
    warn_rag_p95_ms: float = 500.0
    critical_rag_p95_ms: float = 1_500.0
    warn_rag_empty_rate: float = 0.35
    critical_rag_empty_rate: float = 0.60
    warn_agent_limit_hit_rate: float = 0.15
    critical_agent_limit_hit_rate: float = 0.35
    critical_quota_exhausted_count: int = 1
    critical_auth_failure_count: int = 1
    warn_unavailable_count: int = 3
    critical_unavailable_count: int = 10


DEFAULT_SLO_THRESHOLDS = SloThresholds()


def evaluate_operational_health(
    snapshot: dict[str, Any],
    thresholds: SloThresholds = DEFAULT_SLO_THRESHOLDS,
) -> dict[str, Any]:
    """Evaluate a metrics snapshot against SLO thresholds and return actionable alerts."""
    alerts: list[dict[str, Any]] = []
    ai = snapshot.get("ai", {})
    total_reqs = int(ai.get("totalRequests", 0))
    errors_by_cat: dict[str, int] = ai.get("errorsByCategory", {})

    def _add(
        severity: str,
        code: str,
        metric: str,
        observed: float | int,
        threshold: float | int,
        action: str,
    ) -> None:
        alerts.append(
            {
                "severity": severity,
                "code": code,
                "metric": metric,
                "observed": observed,
                "threshold": threshold,
                "action": action,
            }
        )

    # 1. Immediate operational / billing / availability signals (no min sample gate)
    quota_exhausted = int(errors_by_cat.get("gemini_quota_exhausted", 0))
    if quota_exhausted >= thresholds.critical_quota_exhausted_count:
        _add(
            "critical",
            "QUOTA_EXHAUSTED",
            "ai.errors.gemini_quota_exhausted",
            quota_exhausted,
            thresholds.critical_quota_exhausted_count,
            "Verify Google Cloud / Gemini daily quota and billing cap immediately.",
        )

    auth_errors = int(errors_by_cat.get("gemini_auth", 0)) + int(
        errors_by_cat.get("auth_failure", 0)
    )
    if auth_errors >= thresholds.critical_auth_failure_count:
        _add(
            "critical",
            "AUTH_CONFIGURATION_FAILURE",
            "ai.errors.auth_total",
            auth_errors,
            thresholds.critical_auth_failure_count,
            "Verify GEMINI_API_KEY and AI_SERVICE_JWT_SECRET / AI_BACKEND_SERVICE_SECRET parity.",
        )

    unavailable = int(errors_by_cat.get("python_unavailable", 0)) + int(
        errors_by_cat.get("gemini_unavailable", 0)
    )
    if unavailable >= thresholds.critical_unavailable_count:
        _add(
            "critical",
            "SERVICE_AVAILABILITY_CRITICAL",
            "ai.errors.unavailable_total",
            unavailable,
            thresholds.critical_unavailable_count,
            "Check ai-backend /health/live, Render cold-starts, and upstream Gemini status.",
        )
    elif unavailable >= thresholds.warn_unavailable_count:
        _add(
            "warning",
            "SERVICE_AVAILABILITY_DEGRADED",
            "ai.errors.unavailable_total",
            unavailable,
            thresholds.warn_unavailable_count,
            "Monitor upstream provider 503s and ai-backend worker responsiveness.",
        )

    # 2. Sample-gated rate & latency thresholds
    if total_reqs >= thresholds.min_samples:
        failure_rate = float(ai.get("failureRate", 0.0))
        if failure_rate >= thresholds.critical_error_rate:
            _add(
                "critical",
                "HIGH_AI_ERROR_RATE",
                "ai.failureRate",
                failure_rate,
                thresholds.critical_error_rate,
                "Inspect top errorCategory in structured logs and verify provider/service health.",
            )
        elif failure_rate >= thresholds.warn_error_rate:
            _add(
                "warning",
                "ELEVATED_AI_ERROR_RATE",
                "ai.failureRate",
                failure_rate,
                thresholds.warn_error_rate,
                "Review recent ai.call.failed and ai.request.failed events.",
            )

        timeout_rate = float(ai.get("timeoutRate", 0.0))
        if timeout_rate >= thresholds.critical_timeout_rate:
            _add(
                "critical",
                "HIGH_TIMEOUT_RATE",
                "ai.timeoutRate",
                timeout_rate,
                thresholds.critical_timeout_rate,
                "Check Gemini latency, cold starts, and Node/Python deadline margins.",
            )
        elif timeout_rate >= thresholds.warn_timeout_rate:
            _add(
                "warning",
                "ELEVATED_TIMEOUT_RATE",
                "ai.timeoutRate",
                timeout_rate,
                thresholds.warn_timeout_rate,
                "Monitor model attempt durations and context token sizes.",
            )

        fallback_rate = float(ai.get("fallbackRate", 0.0))
        if fallback_rate >= thresholds.critical_fallback_rate:
            _add(
                "critical",
                "HIGH_FALLBACK_RATE",
                "ai.fallbackRate",
                fallback_rate,
                thresholds.critical_fallback_rate,
                "Primary model experiencing heavy cooldowns/429s; inspect ModelCooldown logs.",
            )
        elif fallback_rate >= thresholds.warn_fallback_rate:
            _add(
                "warning",
                "ELEVATED_FALLBACK_RATE",
                "ai.fallbackRate",
                fallback_rate,
                thresholds.warn_fallback_rate,
                "Monitor primary model RPM limits and fallback model quality.",
            )

    # 3. Feature p95 latencies
    by_feature: dict[str, dict[str, Any]] = ai.get("byFeature", {})
    for chat_feat in ("coach_chat", "coach_insights", "coach_agent"):
        feat_data = by_feature.get(chat_feat, {})
        lat = feat_data.get("latency", {})
        if int(feat_data.get("requests", 0)) >= thresholds.min_samples:
            p95 = float(lat.get("p95Ms", 0.0))
            if p95 >= thresholds.critical_chat_p95_ms:
                _add(
                    "critical",
                    "CHAT_LATENCY_CRITICAL",
                    f"ai.{chat_feat}.p95Ms",
                    p95,
                    thresholds.critical_chat_p95_ms,
                    "Reduce prompt/context size or check upstream Gemini latency.",
                )
            elif p95 >= thresholds.warn_chat_p95_ms:
                _add(
                    "warning",
                    "CHAT_LATENCY_WARN",
                    f"ai.{chat_feat}.p95Ms",
                    p95,
                    thresholds.warn_chat_p95_ms,
                    "Profile context assembly, RAG, and model latency spans.",
                )

    for mm_feat in ("meal_photo", "voice_meal", "transcribe"):
        feat_data = by_feature.get(mm_feat, {})
        lat = feat_data.get("latency", {})
        if int(feat_data.get("requests", 0)) >= thresholds.min_samples:
            p95 = float(lat.get("p95Ms", 0.0))
            if p95 >= thresholds.critical_multimodal_p95_ms:
                _add(
                    "critical",
                    "MULTIMODAL_LATENCY_CRITICAL",
                    f"ai.{mm_feat}.p95Ms",
                    p95,
                    thresholds.critical_multimodal_p95_ms,
                    "Media processing approaching mobile 25-30s timeout.",
                )
            elif p95 >= thresholds.warn_multimodal_p95_ms:
                _add(
                    "warning",
                    "MULTIMODAL_LATENCY_WARN",
                    f"ai.{mm_feat}.p95Ms",
                    p95,
                    thresholds.warn_multimodal_p95_ms,
                    "Monitor payload sizes and vision/audio Gemini turn times.",
                )

    # 4. RAG thresholds
    rag: dict[str, dict[str, Any]] = snapshot.get("rag", {})
    for mode, stats in rag.items():
        retrievals = int(stats.get("retrievals", 0))
        if retrievals >= thresholds.min_samples:
            empty_rate = float(stats.get("emptyRate", 0.0))
            if empty_rate >= thresholds.critical_rag_empty_rate:
                _add(
                    "critical",
                    "RAG_EMPTY_RATE_CRITICAL",
                    f"rag.{mode}.emptyRate",
                    empty_rate,
                    thresholds.critical_rag_empty_rate,
                    "Verify active knowledge documents, embeddings, and similarity thresholds.",
                )
            elif empty_rate >= thresholds.warn_rag_empty_rate:
                _add(
                    "warning",
                    "RAG_EMPTY_RATE_WARN",
                    f"rag.{mode}.emptyRate",
                    empty_rate,
                    thresholds.warn_rag_empty_rate,
                    "Review minSimilarity cutoff and query routing rules.",
                )

            rag_p95 = float(stats.get("latency", {}).get("p95Ms", 0.0))
            if rag_p95 >= thresholds.critical_rag_p95_ms:
                _add(
                    "critical",
                    "RAG_LATENCY_CRITICAL",
                    f"rag.{mode}.p95Ms",
                    rag_p95,
                    thresholds.critical_rag_p95_ms,
                    "Check pgvector HNSW index usage and query embedding latency.",
                )
            elif rag_p95 >= thresholds.warn_rag_p95_ms:
                _add(
                    "warning",
                    "RAG_LATENCY_WARN",
                    f"rag.{mode}.p95Ms",
                    rag_p95,
                    thresholds.warn_rag_p95_ms,
                    "Inspect hybrid search candidate limits and DB pool health.",
                )

    # 5. Agent execution limit hits
    agent_engines: dict[str, dict[str, Any]] = snapshot.get("agent", {}).get("byEngine", {})
    for engine, stats in agent_engines.items():
        execs = int(stats.get("executions", 0))
        if execs >= thresholds.min_samples:
            limit_rate = float(stats.get("limitHits", 0)) / execs
            if limit_rate >= thresholds.critical_agent_limit_hit_rate:
                _add(
                    "critical",
                    "AGENT_LIMIT_HIT_CRITICAL",
                    f"agent.{engine}.limitHitRate",
                    round(limit_rate, 4),
                    thresholds.critical_agent_limit_hit_rate,
                    "Review agent iteration/tool budgets and replanning loops.",
                )
            elif limit_rate >= thresholds.warn_agent_limit_hit_rate:
                _add(
                    "warning",
                    "AGENT_LIMIT_HIT_WARN",
                    f"agent.{engine}.limitHitRate",
                    round(limit_rate, 4),
                    thresholds.warn_agent_limit_hit_rate,
                    "Inspect agent step budgets and tool latency.",
                )

    severities = {a["severity"] for a in alerts}
    if "critical" in severities:
        status = "critical"
    elif "warning" in severities:
        status = "degraded"
    else:
        status = "healthy"
    return {
        "status": status,
        "alerts": alerts,
        "summary": {
            "totalRequests": total_reqs,
            "failureRate": ai.get("failureRate", 0.0),
            "fallbackRate": ai.get("fallbackRate", 0.0),
            "estimatedCostUsd": ai.get("estimatedCostUsd", 0.0),
        },
    }
