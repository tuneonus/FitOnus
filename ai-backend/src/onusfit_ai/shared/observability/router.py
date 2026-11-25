"""Internal observability endpoint returning sanitized metrics, health status, and spans.

Protected by internal service-to-service JWT authentication (`require_scope`) so sensitive
operational telemetry is never exposed publicly. Returns sanitized, bounded aggregates only.
"""

from typing import Any

from fastapi import APIRouter, Depends

from onusfit_ai import __version__
from onusfit_ai.shared.auth import ServiceClaims, require_scope
from onusfit_ai.shared.config import Settings, get_settings
from onusfit_ai.shared.logging import (
    clean_fields,
    default_span_recorder,
    evaluate_operational_health,
    metrics_registry,
    redact,
)
from onusfit_ai.shared.logging.logging import SERVICE_NAME

OBSERVABILITY_SCOPE = "ai:observability:read"
require_observability_scope = require_scope(OBSERVABILITY_SCOPE)

router = APIRouter(tags=["observability"])

_MAX_RECENT_SPANS = 20


def _build_sanitized_payload(settings: Settings) -> dict[str, Any]:
    """Assemble sanitized, privacy-safe process telemetry without PII or raw prompts."""
    snapshot = metrics_registry.snapshot()
    health = evaluate_operational_health(snapshot)
    recent = default_span_recorder.recent_spans(limit=_MAX_RECENT_SPANS)
    sanitized_spans = [
        {
            "traceId": span.trace_id,
            "spanId": span.span_id,
            "parentSpanId": span.parent_span_id,
            "service": span.service,
            "operation": redact(span.operation)[:80],
            "status": span.status,
            "durationMs": span.duration_ms,
            "errorCategory": span.error_category,
            "attributes": clean_fields(dict(span.attributes)),
        }
        for span in recent
    ]
    return {
        "status": health["status"],
        "service": SERVICE_NAME,
        "version": __version__,
        "environment": settings.environment,
        "processLocal": True,
        "restartBehavior": (
            "Counters, percentiles, and the bounded span buffer reside in process memory "
            "and reset cleanly on process restart or worker recycle."
        ),
        "metrics": snapshot,
        "health": health,
        "tracing": {
            "capacity": default_span_recorder.capacity,
            "bufferedSpans": default_span_recorder.count(),
            "recentSpans": sanitized_spans,
        },
    }


@router.get("/observability")
def get_observability_snapshot(
    _claims: ServiceClaims = Depends(require_observability_scope),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Return sanitized process-local AI metrics, SLO health, and bounded trace spans."""
    return _build_sanitized_payload(settings)


@router.get("/internal/v1/observability", include_in_schema=False)
def get_internal_observability_snapshot(
    _claims: ServiceClaims = Depends(require_observability_scope),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """Internal prefix alias for sanitized process-local observability telemetry."""
    return _build_sanitized_payload(settings)
