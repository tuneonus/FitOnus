"""Privacy-safe observability and telemetry for FitOnus Multi-Agent workflows.

Reuses `shared.logging.log_event` and request `trace_id` (`aiRequestId`).
Strictly NEVER logs private fitness records, user IDs, credentials, or model thoughts.
"""

import logging
import time
from dataclasses import dataclass, field

from onusfit_ai.shared.logging import log_event, metrics_registry

logger = logging.getLogger("onusfit_ai.coach.multi_agent")


@dataclass
class MultiAgentTelemetry:
    """Collects privacy-safe metrics across a single multi-agent request."""

    trace_id: str
    start_time: float = field(default_factory=time.monotonic)
    routing_mode: str = "unknown"
    goal_type: str = "unknown"
    language: str = "en"
    selected_agents: list[str] = field(default_factory=list)
    agent_durations_ms: dict[str, float] = field(default_factory=dict)
    agent_statuses: dict[str, str] = field(default_factory=dict)
    delegation_count: int = 0
    parallel_batches: int = 0
    replans_count: int = 0
    llm_calls_count: int = 0
    tool_calls_count: int = 0
    tool_failures_count: int = 0
    tool_cache_hits: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    fallback_used: bool = False
    fallback_reason: str | None = None
    agent_failures_count: int = 0
    error_categories: list[str] = field(default_factory=list)
    outcome: str = "ok"
    termination_reason: str = "unknown"

    def record_routing(
        self,
        *,
        mode: str,
        goal_type: str,
        language: str,
        selected_agents: list[str],
    ) -> None:
        self.routing_mode = mode
        self.goal_type = goal_type
        self.language = language
        self.selected_agents = list(selected_agents)
        log_event(
            logger,
            "multi_agent.routing.decided",
            message="Multi-agent supervisor routing decision made",
            aiRequestId=self.trace_id,
            routingMode=mode,
            goalType=goal_type,
            language=language,
            selectedAgents=self.selected_agents,
            agentCount=len(self.selected_agents),
        )

    def record_agent_result(
        self,
        *,
        agent_role: str,
        status: str,
        duration_ms: float,
        failed: bool = False,
        error_category: str | None = None,
    ) -> None:
        self.agent_durations_ms[agent_role] = round(duration_ms, 2)
        self.agent_statuses[agent_role] = status
        if failed:
            self.agent_failures_count += 1
            if error_category:
                self.error_categories.append(error_category)
        log_event(
            logger,
            "multi_agent.agent.completed",
            message=f"Specialist agent '{agent_role}' finished",
            aiRequestId=self.trace_id,
            agentRole=agent_role,
            status=status,
            durationMs=round(duration_ms, 2),
            failed=failed,
            errorCategory=error_category,
        )

    def log_workflow_completed(self) -> None:
        total_ms = round(max(0.0, (time.monotonic() - self.start_time) * 1000.0), 2)
        try:
            reason_lower = self.termination_reason.lower()
            limit_hit: str | None = None
            if "max_" in reason_lower or "budget" in reason_lower or "deadline" in reason_lower:
                limit_hit = self.termination_reason
            metrics_registry.record_agent_execution(
                engine="multi_agent",
                routing_decision=self.routing_mode,
                duration_ms=total_ms,
                tool_calls=self.tool_calls_count,
                tool_failures=self.tool_failures_count,
                iterations=self.delegation_count,
                replans=self.replans_count,
                limit_hit=limit_hit,
                failed=(self.outcome == "error" or self.agent_failures_count > 0),
                fallback_used=self.fallback_used,
            )
        except Exception:  # noqa: BLE001 - fail-open observability
            pass
        log_event(
            logger,
            "multi_agent.workflow.completed",
            message="Multi-agent workflow completed",
            aiRequestId=self.trace_id,
            routingMode=self.routing_mode,
            goalType=self.goal_type,
            language=self.language,
            selectedAgents=self.selected_agents,
            agentDurationsMs=self.agent_durations_ms,
            agentStatuses=self.agent_statuses,
            delegationCount=self.delegation_count,
            parallelBatches=self.parallel_batches,
            replansCount=self.replans_count,
            llmCallsCount=self.llm_calls_count,
            toolCallsCount=self.tool_calls_count,
            toolFailuresCount=self.tool_failures_count,
            toolCacheHits=self.tool_cache_hits,
            inputTokens=self.input_tokens,
            outputTokens=self.output_tokens,
            totalTokens=self.total_tokens,
            fallbackUsed=self.fallback_used,
            fallbackReason=self.fallback_reason,
            agentFailuresCount=self.agent_failures_count,
            errorCategories=self.error_categories,
            outcome=self.outcome,
            terminationReason=self.termination_reason,
            totalDurationMs=total_ms,
        )
