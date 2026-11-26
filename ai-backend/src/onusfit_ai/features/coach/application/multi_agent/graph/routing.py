"""Conditional routing functions for FitOnus LangGraph multi-agent workflows (Stage 05)."""

from typing import Literal

from onusfit_ai.features.coach.application.multi_agent.graph.state import (
    MultiAgentGraphState,
)
from onusfit_ai.features.coach.domain.multi_agent import (
    MultiAgentWorkflowStatus,
    OrchestrationMode,
)

_HALT_STATUSES = {
    MultiAgentWorkflowStatus.CANCELLED,
    MultiAgentWorkflowStatus.DEADLINE_EXCEEDED,
    MultiAgentWorkflowStatus.BUDGET_EXCEEDED,
}


def route_after_select_agents(
    state: MultiAgentGraphState,
) -> Literal["delegate_tasks", "final_synthesis"]:
    """Bypass task delegation on simple queries or safety/budget/cancel halts."""
    if state.get("status") in _HALT_STATUSES:
        return "final_synthesis"
    decision = state.get("routing_decision")
    if decision is None or decision.mode == OrchestrationMode.BYPASS:
        return "final_synthesis"
    if not state.get("pending_tasks"):
        return "final_synthesis"
    return "delegate_tasks"


def route_after_validation(
    state: MultiAgentGraphState,
) -> Literal["replan_tasks", "final_synthesis"]:
    """Trigger bounded replanning when recoverable failures exist within limits."""
    if state.get("medical_halted") or state.get("status") in _HALT_STATUSES:
        return "final_synthesis"
    if state.get("needs_replan") and state.get("replan_attempts", 0) < state.get(
        "max_replanning_attempts", 1
    ):
        return "replan_tasks"
    return "final_synthesis"
