"""Zero-PII structured telemetry and audit logging for LangGraph Workout Planning."""

import logging
import time
from typing import Any

from onusfit_ai.shared.logging import clean_fields, log_event, metrics_registry

logger = logging.getLogger("onusfit_ai.workout_planner.graph.telemetry")


class WorkoutPlannerTelemetry:
    """Logs state-machine transitions and operational metrics without logging PII."""

    @staticmethod
    def record_node_event(
        node_name: str,
        user_id: str,
        trace_id: str,
        duration_ms: float,
        status: str = "success",
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        del user_id  # Never retain or log raw user identifiers in telemetry payloads.
        safe_meta = clean_fields(metadata or {})
        rounded_ms = round(max(0.0, duration_ms), 2)
        event: dict[str, Any] = {
            "node": node_name,
            "trace_id": trace_id,
            "duration_ms": rounded_ms,
            "status": status,
            "timestamp": time.time(),
            "metadata": safe_meta,
        }
        try:
            metrics_registry.record_tool_call(
                tool_name=f"wp_{node_name}",
                duration_ms=rounded_ms,
                success=status == "success",
            )
        except Exception:  # noqa: BLE001 - fail-open observability
            pass
        log_event(
            logger,
            "workout_planner.graph.node",
            level=logging.WARNING if status != "success" else logging.INFO,
            message="workout planner node completed",
            aiRequestId=trace_id,
            node=node_name,
            status=status,
            durationMs=rounded_ms,
        )
        return event
