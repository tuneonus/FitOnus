"""Privacy-safe domain observability helpers for RAG, Agent workflows, and Multimodal inputs.

Pure Python (no FastAPI/Starlette/Gemini SDK dependencies) so any application layer or isolated
test can record structured logs, metrics, and trace spans without violating layer boundaries.
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Any

from onusfit_ai.shared.logging.logging import log_event
from onusfit_ai.shared.logging.metrics import AiMetricsRegistry, metrics_registry
from onusfit_ai.shared.logging.tracing import BoundedSpanRecorder, default_span_recorder, start_span

rag_logger = logging.getLogger("onusfit_ai.rag")
agent_logger = logging.getLogger("onusfit_ai.agent.observability")
multimodal_logger = logging.getLogger("onusfit_ai.multimodal.observability")


def record_rag_retrieval(
    *,
    mode: str,
    duration_ms: float,
    candidate_count: int,
    returned_count: int,
    top_score: float | None = None,
    avg_score: float | None = None,
    reranked: bool = False,
    rerank_duration_ms: float = 0.0,
    citations_count: int = 0,
    grounded: bool = True,
    failed: bool = False,
    error_category: str | None = None,
    metrics: AiMetricsRegistry | None = None,
    logger: logging.Logger | None = None,
) -> dict[str, Any]:
    """Emit structured `ai.rag.retrieval` log and update RAG metrics (never logs query/content)."""
    empty_result = (returned_count == 0) and not failed
    registry = metrics or metrics_registry
    try:
        registry.record_rag_retrieval(
            mode=mode,
            duration_ms=duration_ms,
            candidate_count=candidate_count,
            returned_count=returned_count,
            top_score=top_score,
            avg_score=avg_score,
            reranked=reranked,
            rerank_duration_ms=rerank_duration_ms,
            citations_count=citations_count,
            grounded=grounded,
            empty_result=empty_result,
            failed=failed,
        )
    except Exception:  # noqa: BLE001 - fail-open observability
        pass

    payload: dict[str, Any] = {
        "mode": mode,
        "durationMs": round(max(0.0, duration_ms), 2),
        "candidateCount": max(0, candidate_count),
        "returnedCount": max(0, returned_count),
        "emptyResult": empty_result,
        "reranked": reranked,
        "citationsCount": max(0, citations_count),
        "grounded": grounded and returned_count > 0,
        "success": not failed,
    }
    if top_score is not None:
        payload["topScore"] = round(top_score, 4)
    if avg_score is not None:
        payload["avgScore"] = round(avg_score, 4)
    if reranked:
        payload["rerankDurationMs"] = round(max(0.0, rerank_duration_ms), 2)
    if error_category:
        payload["errorCategory"] = error_category

    log_event(
        logger or rag_logger,
        "ai.rag.retrieval",
        level=logging.WARNING if failed else logging.INFO,
        message="RAG retrieval completed",
        **payload,
    )
    return payload


@dataclass
class AgentObservabilityTracker:
    """Tracks routing, tool execution, limits, failures, and fallbacks for agent runs."""

    engine: str
    trace_id: str
    metrics: AiMetricsRegistry = field(default_factory=lambda: metrics_registry)
    span_recorder: BoundedSpanRecorder = field(default_factory=lambda: default_span_recorder)
    started_at: float = field(default_factory=time.monotonic)
    routing_decision: str = "unknown"
    tool_calls_count: int = 0
    tool_failures_count: int = 0
    iterations: int = 0
    replans: int = 0
    limit_hit: str | None = None
    fallback_used: bool = False
    failed: bool = False
    error_category: str | None = None

    def record_routing(
        self,
        *,
        intent: str,
        requires_agent: bool,
        selected_agents: list[str] | None = None,
    ) -> None:
        self.routing_decision = intent
        log_event(
            agent_logger,
            "ai.agent.routing",
            message="Agent routing decision recorded",
            aiRequestId=self.trace_id,
            engine=self.engine,
            routingDecision=intent,
            requiresAgent=requires_agent,
            selectedAgents=selected_agents or [],
        )

    def record_tool_call(
        self,
        *,
        tool_name: str,
        duration_ms: float,
        success: bool,
        cached: bool = False,
        error_category: str | None = None,
    ) -> None:
        self.tool_calls_count += 1
        if not success:
            self.tool_failures_count += 1
        try:
            self.metrics.record_tool_call(
                tool_name=tool_name,
                duration_ms=duration_ms,
                success=success,
                cached=cached,
            )
            with start_span(
                f"agent.tool.{tool_name}",
                attributes={"tool": tool_name, "cached": cached, "success": success},
                recorder=self.span_recorder,
            ) as span:
                if not success and error_category:
                    span.mark_error(error_category)
        except Exception:  # noqa: BLE001 - fail-open observability
            pass

        log_event(
            agent_logger,
            "ai.agent.tool_call",
            level=logging.WARNING if not success else logging.INFO,
            message="Agent tool call recorded",
            aiRequestId=self.trace_id,
            engine=self.engine,
            tool=tool_name,
            durationMs=round(max(0.0, duration_ms), 2),
            success=success,
            cached=cached,
            errorCategory=error_category,
        )

    def record_limit_hit(self, limit_type: str) -> None:
        self.limit_hit = limit_type

    def record_fallback(self, reason_category: str) -> None:
        self.fallback_used = True
        self.error_category = reason_category

    def record_failure(self, error_category: str) -> None:
        self.failed = True
        self.error_category = error_category

    def finalize(self, *, outcome: str = "ok") -> dict[str, Any]:
        duration_ms = round(max(0.0, (time.monotonic() - self.started_at) * 1000.0), 2)
        try:
            self.metrics.record_agent_execution(
                engine=self.engine,
                routing_decision=self.routing_decision,
                duration_ms=duration_ms,
                tool_calls=self.tool_calls_count,
                tool_failures=self.tool_failures_count,
                iterations=self.iterations,
                replans=self.replans,
                limit_hit=self.limit_hit,
                failed=self.failed,
                fallback_used=self.fallback_used,
            )
        except Exception:  # noqa: BLE001 - fail-open observability
            pass

        payload: dict[str, Any] = {
            "aiRequestId": self.trace_id,
            "engine": self.engine,
            "routingDecision": self.routing_decision,
            "durationMs": duration_ms,
            "toolCallsCount": self.tool_calls_count,
            "toolFailuresCount": self.tool_failures_count,
            "iterations": self.iterations,
            "replans": self.replans,
            "limitHit": self.limit_hit,
            "fallbackUsed": self.fallback_used,
            "success": not self.failed,
            "outcome": outcome,
            "errorCategory": self.error_category,
        }
        log_event(
            agent_logger,
            "ai.agent.execution",
            level=logging.ERROR if self.failed else logging.INFO,
            message="Agent execution completed",
            **payload,
        )
        return payload


def classify_media_validation_error(message: str) -> str:
    """Map media validation failure text into a closed, bounded failure-reason label."""
    lower = message.lower()
    if "mime" in lower or "format" in lower or "supported" in lower:
        return "invalid_mime"
    if "size" in lower or "exceeds maximum decoded" in lower or "too large" in lower:
        return "oversize"
    if "polyglot" in lower or "unsafe" in lower:
        return "polyglot"
    if "dimension" in lower or "pixel" in lower:
        return "pixel_bomb"
    if "duration" in lower:
        return "duration_exceeded"
    if "empty" in lower:
        return "empty_payload"
    if "base64" in lower or "valid jpeg" in lower or "decode" in lower:
        return "corrupt_decode"
    return "other"


@dataclass
class MultimodalObservabilityTracker:
    """Privacy-safe tracker for image/audio validation latency, errors, and model usage."""

    modality: str
    feature: str
    trace_id: str
    metrics: AiMetricsRegistry = field(default_factory=lambda: metrics_registry)
    started_at: float = field(default_factory=time.monotonic)
    validation_duration_ms: float = 0.0
    byte_size: int = 0

    def record_validation_success(
        self,
        *,
        duration_ms: float,
        byte_size: int,
        mime_type: str,
        exif_stripped: bool = False,
    ) -> None:
        self.validation_duration_ms = round(max(0.0, duration_ms), 2)
        self.byte_size = max(0, byte_size)
        log_event(
            multimodal_logger,
            "ai.multimodal.validated",
            message="Multimodal media validation succeeded",
            aiRequestId=self.trace_id,
            feature=self.feature,
            modality=self.modality,
            hasMimeType=bool(mime_type),
            byteSize=self.byte_size,
            exifStripped=exif_stripped,
            validationDurationMs=self.validation_duration_ms,
        )

    def record_validation_failure(
        self,
        *,
        duration_ms: float,
        reason: str,
        byte_size: int = 0,
    ) -> None:
        val_ms = round(max(0.0, duration_ms), 2)
        total_ms = round(max(0.0, (time.monotonic() - self.started_at) * 1000.0), 2)
        try:
            self.metrics.record_multimodal_processing(
                modality=self.modality,
                duration_ms=total_ms,
                validation_duration_ms=val_ms,
                validation_failed=True,
                validation_reason=reason,
                byte_size=byte_size,
            )
        except Exception:  # noqa: BLE001 - fail-open observability
            pass
        log_event(
            multimodal_logger,
            "ai.multimodal.validation_failed",
            level=logging.WARNING,
            message="Multimodal media validation rejected input",
            aiRequestId=self.trace_id,
            feature=self.feature,
            modality=self.modality,
            validationReason=reason,
            validationDurationMs=val_ms,
        )

    def record_processing_completed(
        self,
        *,
        model: str,
        outcome: str,
        processing_error: bool = False,
        error_category: str | None = None,
    ) -> dict[str, Any]:
        total_ms = round(max(0.0, (time.monotonic() - self.started_at) * 1000.0), 2)
        try:
            self.metrics.record_multimodal_processing(
                modality=self.modality,
                duration_ms=total_ms,
                validation_duration_ms=self.validation_duration_ms,
                validation_failed=False,
                model=model,
                processing_error=processing_error,
                byte_size=self.byte_size,
            )
        except Exception:  # noqa: BLE001 - fail-open observability
            pass
        payload: dict[str, Any] = {
            "aiRequestId": self.trace_id,
            "feature": self.feature,
            "modality": self.modality,
            "model": model,
            "outcome": outcome,
            "byteSize": self.byte_size,
            "validationDurationMs": self.validation_duration_ms,
            "durationMs": total_ms,
            "success": not processing_error,
        }
        if error_category:
            payload["errorCategory"] = error_category
        log_event(
            multimodal_logger,
            "ai.multimodal.completed",
            level=logging.ERROR if processing_error else logging.INFO,
            message="Multimodal processing completed",
            **payload,
        )
        return payload
