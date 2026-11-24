"""Zero-PII telemetry and audit logging for LangGraph Workout Planning."""

import logging
import time
from typing import Any

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
        event = {
            "node": node_name,
            "user_id": user_id,
            "trace_id": trace_id,
            "duration_ms": round(duration_ms, 2),
            "status": status,
            "timestamp": time.time(),
            "metadata": metadata or {},
        }
        logger.info(
            "workout_planner.graph_event node=%s status=%s duration_ms=%.2f trace_id=%s",
            node_name,
            status,
            duration_ms,
            trace_id,
        )
        return event
