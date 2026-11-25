"""Lightweight, bounded-cardinality, thread-safe in-memory AI metrics registry.

Tracks request/LLM, RAG retrieval/grounding, agent orchestration, and multimodal validation
metrics across FitOnus AI workflows using closed label vocabularies and fixed-size ring buffers
so memory remains strictly bounded even under sustained load or adversarial input.
"""

import math
import threading
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Final

MAX_LATENCY_SAMPLES: Final = 256
MAX_SERIES_PER_GROUP: Final = 64
OVERFLOW_LABEL: Final = "_other"

ALLOWED_FEATURES: Final = frozenset(
    {
        "coach_chat",
        "coach_insights",
        "coach_memory_extract",
        "coach_agent",
        "coach_multi_agent",
        "voice_meal",
        "meal_photo",
        "multimodal_meal",
        "transcribe",
        "knowledge_embed",
        "workout_planner",
        "rag",
    }
)

ALLOWED_ERROR_CATEGORIES: Final = frozenset(
    {
        "gemini_timeout",
        "gemini_rate_limited",
        "gemini_quota_exhausted",
        "gemini_unavailable",
        "gemini_auth",
        "gemini_error",
        "python_unavailable",
        "python_timeout",
        "auth_failure",
        "invalid_ai_response",
        "invalid_request",
        "internal_error",
    }
)

ALLOWED_RAG_MODES: Final = frozenset({"vector", "lexical", "hybrid", "reranked"})
ALLOWED_AGENT_ENGINES: Final = frozenset({"native", "langgraph", "multi_agent", "workout_planner"})
ALLOWED_MODALITIES: Final = frozenset({"image", "audio", "multimodal"})
ALLOWED_MEDIA_FAILURE_REASONS: Final = frozenset(
    {
        "invalid_mime",
        "oversize",
        "polyglot",
        "pixel_bomb",
        "duration_exceeded",
        "corrupt_decode",
        "empty_payload",
        "other",
    }
)

# Default USD pricing per 1M tokens (matches backend GeminiRuntimeService fallback rates).
DEFAULT_MODEL_PRICING_USD_PER_M: Final[dict[str, tuple[float, float, float]]] = {
    "gemini-3.5-flash-lite": (0.075, 0.30, 0.01875),
    "gemini-3.1-flash-lite": (0.075, 0.30, 0.01875),
    "gemini-2.5-flash": (0.15, 0.60, 0.0375),
    "gemini-2.5-flash-lite": (0.075, 0.30, 0.01875),
    "gemini-embedding-001": (0.02, 0.0, 0.0),
}
_DEFAULT_PRICING: Final = (0.075, 0.30, 0.01875)


def _bound_closed(value: str | None, allowed: frozenset[str], default: str = OVERFLOW_LABEL) -> str:
    if not value:
        return default
    cleaned = value.strip().lower()
    return cleaned if cleaned in allowed else default


def _bound_dynamic_key(bucket: dict[str, Any], raw_key: str | None, max_keys: int) -> str:
    key = (raw_key or "").strip()[:64] or OVERFLOW_LABEL
    if key in bucket or len(bucket) < max_keys:
        return key
    return OVERFLOW_LABEL


def estimate_cost_usd(
    model: str,
    input_tokens: int,
    output_tokens: int,
    cached_tokens: int = 0,
    pricing_table: dict[str, tuple[float, float, float]] | None = None,
) -> float:
    table = pricing_table or DEFAULT_MODEL_PRICING_USD_PER_M
    in_rate, out_rate, cached_rate = table.get(model, _DEFAULT_PRICING)
    billable_input = max(0, input_tokens - max(0, cached_tokens))
    cost = (
        (billable_input * in_rate)
        + (max(0, output_tokens) * out_rate)
        + (max(0, cached_tokens) * cached_rate)
    ) / 1_000_000.0
    return round(cost, 6)


def _percentile(sorted_values: list[float], pct: float) -> float:
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return round(sorted_values[0], 3)
    pos = (pct / 100.0) * (len(sorted_values) - 1)
    lower = math.floor(pos)
    upper = math.ceil(pos)
    if lower == upper:
        return round(sorted_values[int(pos)], 3)
    weight = pos - lower
    val = sorted_values[lower] * (1.0 - weight) + sorted_values[upper] * weight
    return round(val, 3)


@dataclass
class _LatencyWindow:
    samples: deque[float] = field(default_factory=lambda: deque(maxlen=MAX_LATENCY_SAMPLES))
    total_count: int = 0
    total_sum: float = 0.0
    max_val: float = 0.0

    def add(self, value_ms: float) -> None:
        safe_val = max(0.0, float(value_ms)) if math.isfinite(value_ms) else 0.0
        self.samples.append(safe_val)
        self.total_count += 1
        self.total_sum += safe_val
        if safe_val > self.max_val:
            self.max_val = safe_val

    def summary(self) -> dict[str, float | int]:
        ordered = sorted(self.samples)
        avg = round(self.total_sum / self.total_count, 3) if self.total_count > 0 else 0.0
        return {
            "count": self.total_count,
            "avgMs": avg,
            "p50Ms": _percentile(ordered, 50.0),
            "p95Ms": _percentile(ordered, 95.0),
            "p99Ms": _percentile(ordered, 99.0),
            "maxMs": round(self.max_val, 3),
        }


@dataclass
class _FeatureSeries:
    requests: int = 0
    successes: int = 0
    failures: int = 0
    timeouts: int = 0
    retries: int = 0
    fallbacks: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cached_tokens: int = 0
    thinking_tokens: int = 0
    total_tokens: int = 0
    estimated_cost_usd: float = 0.0
    latency: _LatencyWindow = field(default_factory=_LatencyWindow)


@dataclass
class _RagModeSeries:
    retrievals: int = 0
    empty_results: int = 0
    reranked_count: int = 0
    grounded_count: int = 0
    failed_count: int = 0
    candidates_total: int = 0
    returned_total: int = 0
    citations_total: int = 0
    top_score_sum: float = 0.0
    top_score_samples: int = 0
    avg_score_sum: float = 0.0
    avg_score_samples: int = 0
    latency: _LatencyWindow = field(default_factory=_LatencyWindow)
    rerank_latency: _LatencyWindow = field(default_factory=_LatencyWindow)


@dataclass
class _AgentEngineSeries:
    executions: int = 0
    failures: int = 0
    fallbacks: int = 0
    limit_hits: int = 0
    tool_calls: int = 0
    tool_failures: int = 0
    iterations_total: int = 0
    replans_total: int = 0
    latency: _LatencyWindow = field(default_factory=_LatencyWindow)


@dataclass
class _MultimodalModalitySeries:
    requests: int = 0
    validation_failures: int = 0
    processing_errors: int = 0
    total_bytes: int = 0
    latency: _LatencyWindow = field(default_factory=_LatencyWindow)
    validation_latency: _LatencyWindow = field(default_factory=_LatencyWindow)


class AiMetricsRegistry:
    """Thread-safe in-memory AI observability metrics with strict cardinality caps."""

    def __init__(
        self,
        *,
        max_series: int = MAX_SERIES_PER_GROUP,
        pricing_table: dict[str, tuple[float, float, float]] | None = None,
    ) -> None:
        self._lock = threading.Lock()
        self._max_series = max(4, max_series)
        self._pricing_table = pricing_table or DEFAULT_MODEL_PRICING_USD_PER_M
        self._init_state()

    def _init_state(self) -> None:
        self._features: dict[str, _FeatureSeries] = {}
        self._models: dict[str, _FeatureSeries] = {}
        self._errors_by_category: dict[str, int] = {}
        self._rag_modes: dict[str, _RagModeSeries] = {}
        self._agent_engines: dict[str, _AgentEngineSeries] = {}
        self._agent_routing: dict[str, int] = {}
        self._agent_limits: dict[str, int] = {}
        self._tool_stats: dict[str, dict[str, Any]] = {}
        self._multimodal: dict[str, _MultimodalModalitySeries] = {}
        self._multimodal_validation_reasons: dict[str, int] = {}
        self._http_requests: dict[str, int] = {}

    def reset(self) -> None:
        with self._lock:
            self._init_state()

    def record_http_request(self, feature: str | None, status_code: int) -> None:
        feat = _bound_closed(feature, ALLOWED_FEATURES)
        status_bucket = f"{max(100, min(599, status_code)) // 100}xx"
        key = f"{feat}:{status_bucket}"
        with self._lock:
            safe_key = _bound_dynamic_key(self._http_requests, key, self._max_series)
            self._http_requests[safe_key] = self._http_requests.get(safe_key, 0) + 1

    def record_llm_call(
        self,
        *,
        feature: str,
        model: str,
        duration_ms: float,
        success: bool,
        input_tokens: int = 0,
        output_tokens: int = 0,
        cached_tokens: int = 0,
        thinking_tokens: int = 0,
        total_tokens: int = 0,
        is_fallback: bool = False,
        attempts: int = 1,
        error_category: str | None = None,
        timeout: bool = False,
        retry_count: int | None = None,
    ) -> None:
        feat = _bound_closed(feature, ALLOWED_FEATURES)
        retries = retry_count if retry_count is not None else max(0, attempts - 1)
        cost = estimate_cost_usd(
            model, input_tokens, output_tokens, cached_tokens, self._pricing_table
        )
        cat = _bound_closed(error_category, ALLOWED_ERROR_CATEGORIES) if error_category else None

        with self._lock:
            feat_series = self._features.setdefault(feat, _FeatureSeries())
            model_key = _bound_dynamic_key(self._models, model, self._max_series)
            model_series = self._models.setdefault(model_key, _FeatureSeries())

            for series in (feat_series, model_series):
                series.requests += 1
                if success:
                    series.successes += 1
                else:
                    series.failures += 1
                if timeout or cat in ("gemini_timeout", "python_timeout"):
                    series.timeouts += 1
                series.retries += max(0, retries)
                if is_fallback:
                    series.fallbacks += 1
                series.input_tokens += max(0, input_tokens)
                series.output_tokens += max(0, output_tokens)
                series.cached_tokens += max(0, cached_tokens)
                series.thinking_tokens += max(0, thinking_tokens)
                series.total_tokens += max(0, total_tokens)
                series.estimated_cost_usd = round(series.estimated_cost_usd + cost, 6)
                series.latency.add(duration_ms)

            if cat is not None:
                self._errors_by_category[cat] = self._errors_by_category.get(cat, 0) + 1

    def record_request_failure(
        self,
        *,
        feature: str | None,
        error_category: str,
        duration_ms: float = 0.0,
    ) -> None:
        feat = _bound_closed(feature, ALLOWED_FEATURES)
        cat = _bound_closed(error_category, ALLOWED_ERROR_CATEGORIES)
        with self._lock:
            series = self._features.setdefault(feat, _FeatureSeries())
            series.requests += 1
            series.failures += 1
            if cat in ("gemini_timeout", "python_timeout"):
                series.timeouts += 1
            if duration_ms > 0:
                series.latency.add(duration_ms)
            self._errors_by_category[cat] = self._errors_by_category.get(cat, 0) + 1

    def record_rag_retrieval(
        self,
        *,
        mode: str,
        duration_ms: float,
        candidate_count: int = 0,
        returned_count: int = 0,
        top_score: float | None = None,
        avg_score: float | None = None,
        reranked: bool = False,
        rerank_duration_ms: float = 0.0,
        citations_count: int = 0,
        grounded: bool = True,
        empty_result: bool | None = None,
        failed: bool = False,
    ) -> None:
        safe_mode = _bound_closed(mode, ALLOWED_RAG_MODES)
        is_empty = (returned_count == 0) if empty_result is None else empty_result
        with self._lock:
            series = self._rag_modes.setdefault(safe_mode, _RagModeSeries())
            series.retrievals += 1
            if failed:
                series.failed_count += 1
            if is_empty and not failed:
                series.empty_results += 1
            if reranked:
                series.reranked_count += 1
                series.rerank_latency.add(rerank_duration_ms)
            if grounded and returned_count > 0:
                series.grounded_count += 1
            series.candidates_total += max(0, candidate_count)
            series.returned_total += max(0, returned_count)
            series.citations_total += max(0, citations_count)
            if top_score is not None and math.isfinite(top_score):
                series.top_score_sum += float(top_score)
                series.top_score_samples += 1
            if avg_score is not None and math.isfinite(avg_score):
                series.avg_score_sum += float(avg_score)
                series.avg_score_samples += 1
            series.latency.add(duration_ms)

    def record_agent_execution(
        self,
        *,
        engine: str,
        routing_decision: str,
        duration_ms: float,
        tool_calls: int = 0,
        tool_failures: int = 0,
        iterations: int = 0,
        replans: int = 0,
        limit_hit: str | None = None,
        failed: bool = False,
        fallback_used: bool = False,
    ) -> None:
        safe_engine = _bound_closed(engine, ALLOWED_AGENT_ENGINES)
        with self._lock:
            series = self._agent_engines.setdefault(safe_engine, _AgentEngineSeries())
            series.executions += 1
            if failed:
                series.failures += 1
            if fallback_used:
                series.fallbacks += 1
            if limit_hit:
                series.limit_hits += 1
                safe_limit = _bound_dynamic_key(self._agent_limits, limit_hit, self._max_series)
                self._agent_limits[safe_limit] = self._agent_limits.get(safe_limit, 0) + 1
            series.tool_calls += max(0, tool_calls)
            series.tool_failures += max(0, tool_failures)
            series.iterations_total += max(0, iterations)
            series.replans_total += max(0, replans)
            series.latency.add(duration_ms)

            route_key = _bound_dynamic_key(self._agent_routing, routing_decision, self._max_series)
            self._agent_routing[route_key] = self._agent_routing.get(route_key, 0) + 1

    def record_tool_call(
        self,
        *,
        tool_name: str,
        duration_ms: float,
        success: bool,
        cached: bool = False,
    ) -> None:
        with self._lock:
            key = _bound_dynamic_key(self._tool_stats, tool_name, self._max_series)
            entry = self._tool_stats.get(key)
            if entry is None:
                entry = {
                    "calls": 0,
                    "failures": 0,
                    "cacheHits": 0,
                    "latency": _LatencyWindow(),
                }
                self._tool_stats[key] = entry
            entry["calls"] += 1
            if not success:
                entry["failures"] += 1
            if cached:
                entry["cacheHits"] += 1
            entry["latency"].add(duration_ms)

    def record_multimodal_processing(
        self,
        *,
        modality: str,
        duration_ms: float,
        validation_duration_ms: float = 0.0,
        validation_failed: bool = False,
        validation_reason: str | None = None,
        model: str | None = None,
        processing_error: bool = False,
        byte_size: int = 0,
    ) -> None:
        safe_mod = _bound_closed(modality, ALLOWED_MODALITIES)
        with self._lock:
            series = self._multimodal.setdefault(safe_mod, _MultimodalModalitySeries())
            series.requests += 1
            if validation_failed:
                series.validation_failures += 1
                reason = _bound_closed(
                    validation_reason, ALLOWED_MEDIA_FAILURE_REASONS, default="other"
                )
                self._multimodal_validation_reasons[reason] = (
                    self._multimodal_validation_reasons.get(reason, 0) + 1
                )
            if processing_error:
                series.processing_errors += 1
            series.total_bytes += max(0, byte_size)
            series.latency.add(duration_ms)
            if validation_duration_ms > 0:
                series.validation_latency.add(validation_duration_ms)
            if model:
                model_key = _bound_dynamic_key(self._models, model, self._max_series)
                self._models.setdefault(model_key, _FeatureSeries())

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            total_reqs = sum(s.requests for s in self._features.values())
            total_success = sum(s.successes for s in self._features.values())
            total_fail = sum(s.failures for s in self._features.values())
            total_timeouts = sum(s.timeouts for s in self._features.values())
            total_retries = sum(s.retries for s in self._features.values())
            total_fallbacks = sum(s.fallbacks for s in self._features.values())
            total_tokens = sum(s.total_tokens for s in self._features.values())
            total_cost = round(sum(s.estimated_cost_usd for s in self._features.values()), 6)

            def _ser_feature(s: _FeatureSeries) -> dict[str, Any]:
                return {
                    "requests": s.requests,
                    "successes": s.successes,
                    "failures": s.failures,
                    "failureRate": round(s.failures / s.requests, 4) if s.requests else 0.0,
                    "timeouts": s.timeouts,
                    "retries": s.retries,
                    "fallbacks": s.fallbacks,
                    "fallbackRate": round(s.fallbacks / s.requests, 4) if s.requests else 0.0,
                    "inputTokens": s.input_tokens,
                    "outputTokens": s.output_tokens,
                    "cachedTokens": s.cached_tokens,
                    "thinkingTokens": s.thinking_tokens,
                    "totalTokens": s.total_tokens,
                    "estimatedCostUsd": s.estimated_cost_usd,
                    "latency": s.latency.summary(),
                }

            rag_summary = {
                mode: {
                    "retrievals": s.retrievals,
                    "emptyResults": s.empty_results,
                    "emptyRate": round(s.empty_results / s.retrievals, 4) if s.retrievals else 0.0,
                    "rerankedCount": s.reranked_count,
                    "groundedCount": s.grounded_count,
                    "failedCount": s.failed_count,
                    "avgCandidates": (
                        round(s.candidates_total / s.retrievals, 2) if s.retrievals else 0.0
                    ),
                    "avgReturned": (
                        round(s.returned_total / s.retrievals, 2) if s.retrievals else 0.0
                    ),
                    "citationsTotal": s.citations_total,
                    "avgTopScore": (
                        round(s.top_score_sum / s.top_score_samples, 4)
                        if s.top_score_samples
                        else 0.0
                    ),
                    "avgScore": (
                        round(s.avg_score_sum / s.avg_score_samples, 4)
                        if s.avg_score_samples
                        else 0.0
                    ),
                    "latency": s.latency.summary(),
                    "rerankLatency": s.rerank_latency.summary(),
                }
                for mode, s in self._rag_modes.items()
            }

            agent_summary = {
                "byEngine": {
                    engine: {
                        "executions": s.executions,
                        "failures": s.failures,
                        "fallbacks": s.fallbacks,
                        "limitHits": s.limit_hits,
                        "toolCalls": s.tool_calls,
                        "toolFailures": s.tool_failures,
                        "avgIterations": (
                            round(s.iterations_total / s.executions, 2) if s.executions else 0.0
                        ),
                        "replansTotal": s.replans_total,
                        "latency": s.latency.summary(),
                    }
                    for engine, s in self._agent_engines.items()
                },
                "routingDecisions": dict(self._agent_routing),
                "limitHitsByType": dict(self._agent_limits),
                "tools": {
                    name: {
                        "calls": data["calls"],
                        "failures": data["failures"],
                        "cacheHits": data["cacheHits"],
                        "latency": data["latency"].summary(),
                    }
                    for name, data in self._tool_stats.items()
                },
            }

            multimodal_summary = {
                "byModality": {
                    mod: {
                        "requests": s.requests,
                        "validationFailures": s.validation_failures,
                        "processingErrors": s.processing_errors,
                        "totalBytes": s.total_bytes,
                        "latency": s.latency.summary(),
                        "validationLatency": s.validation_latency.summary(),
                    }
                    for mod, s in self._multimodal.items()
                },
                "validationFailuresByReason": dict(self._multimodal_validation_reasons),
            }

            return {
                "ai": {
                    "totalRequests": total_reqs,
                    "successCount": total_success,
                    "failureCount": total_fail,
                    "successRate": round(total_success / total_reqs, 4) if total_reqs else 0.0,
                    "failureRate": round(total_fail / total_reqs, 4) if total_reqs else 0.0,
                    "timeoutCount": total_timeouts,
                    "timeoutRate": round(total_timeouts / total_reqs, 4) if total_reqs else 0.0,
                    "retryCount": total_retries,
                    "fallbackCount": total_fallbacks,
                    "fallbackRate": round(total_fallbacks / total_reqs, 4) if total_reqs else 0.0,
                    "totalTokens": total_tokens,
                    "estimatedCostUsd": total_cost,
                    "byFeature": {k: _ser_feature(v) for k, v in self._features.items()},
                    "byModel": {k: _ser_feature(v) for k, v in self._models.items()},
                    "errorsByCategory": dict(self._errors_by_category),
                },
                "rag": rag_summary,
                "agent": agent_summary,
                "multimodal": multimodal_summary,
                "httpRequests": dict(self._http_requests),
                "cardinality": {
                    "features": len(self._features),
                    "models": len(self._models),
                    "tools": len(self._tool_stats),
                    "maxSeriesPerGroup": self._max_series,
                },
            }


metrics_registry = AiMetricsRegistry()
