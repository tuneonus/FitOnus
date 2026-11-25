"""Privacy-safe telemetry and observability for LangGraph agent workflows.

FitOnus Phase 10: LangGraph Agent Workflows — Stage 07.
Logs node execution times, transitions, tool signatures, error categories,
and termination reasons. Strictly enforces privacy: NEVER logs raw user messages,
private model thoughts, medical history, or PII.
"""

import logging
import time
from dataclasses import dataclass, field

from onusfit_ai.shared.logging import log_event, metrics_registry

logger = logging.getLogger("onusfit_ai.agent.graph")


@dataclass
class GraphExecutionTelemetry:
    """Collects privacy-safe timing and transition metrics across a graph run."""

    trace_id: str
    user_id: str
    start_time: float = field(default_factory=time.monotonic)
    nodes_executed: list[str] = field(default_factory=list)
    node_durations_ms: dict[str, float] = field(default_factory=dict)
    transitions: list[tuple[str, str]] = field(default_factory=list)
    tool_calls_count: int = 0
    tools_executed: list[str] = field(default_factory=list)
    replans_count: int = 0
    outcome: str = "ok"
    termination_reason: str | None = None
    error_category: str | None = None
    engine: str = "langgraph"
    fallback_used: bool = False

    def record_node_start(self, node_name: str) -> float:
        """Records the beginning of a node execution, returning the start timestamp."""
        return time.monotonic()

    def record_node_end(
        self,
        node_name: str,
        start_t: float,
        *,
        success: bool = True,
        error_category: str | None = None,
    ) -> None:
        """Records node duration and adds to the sequence of executed nodes."""
        duration_ms = round((time.monotonic() - start_t) * 1000, 2)
        self.nodes_executed.append(node_name)
        self.node_durations_ms[node_name] = self.node_durations_ms.get(node_name, 0.0) + duration_ms
        if len(self.nodes_executed) > 1:
            from_node = self.nodes_executed[-2]
            self.transitions.append((from_node, node_name))

        if not success and error_category:
            self.error_category = error_category
            self.outcome = "node_error"

        log_event(
            logger,
            "agent.graph.node.completed",
            message=f"Node '{node_name}' finished in {duration_ms}ms",
            aiRequestId=self.trace_id,
            node=node_name,
            durationMs=duration_ms,
            success=success,
            errorCategory=error_category,
        )

    def log_completion(self) -> None:
        """Logs the final summary of graph execution and records bounded metrics."""
        total_duration_ms = round((time.monotonic() - self.start_time) * 1000, 2)
        try:
            limit_hit: str | None = None
            reason = (self.termination_reason or "").lower()
            if "max_iterations" in reason:
                limit_hit = "max_iterations"
            elif "max_tool_calls" in reason:
                limit_hit = "max_tool_calls"
            elif "deadline" in reason:
                limit_hit = "deadline"
            metrics_registry.record_agent_execution(
                engine=self.engine,
                routing_decision=self.outcome,
                duration_ms=total_duration_ms,
                tool_calls=self.tool_calls_count,
                replans=self.replans_count,
                limit_hit=limit_hit,
                failed=self.outcome in ("error", "node_error"),
                fallback_used=self.fallback_used,
            )
        except Exception:  # noqa: BLE001 - fail-open observability
            pass
        log_event(
            logger,
            "agent.graph.completed",
            message="LangGraph agent workflow completed",
            aiRequestId=self.trace_id,
            engine=self.engine,
            totalDurationMs=total_duration_ms,
            nodesExecuted=self.nodes_executed,
            nodeCount=len(self.nodes_executed),
            transitionsCount=len(self.transitions),
            toolCallsCount=self.tool_calls_count,
            toolsExecuted=self.tools_executed,
            replansCount=self.replans_count,
            outcome=self.outcome,
            terminationReason=self.termination_reason,
            errorCategory=self.error_category,
            fallbackUsed=self.fallback_used,
        )
