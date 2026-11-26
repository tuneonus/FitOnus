"""Typed LangGraph state and reducers for FitOnus Multi-Agent Orchestration (Stage 05)."""

from typing import Annotated, TypedDict

from onusfit_ai.features.coach.domain.chat import CoachChatResult
from onusfit_ai.features.coach.domain.multi_agent import (
    AgentExecutionResultItem,
    AgentRecommendation,
    ContextConflict,
    DelegatedTask,
    EvidenceItem,
    MultiAgentTerminationReason,
    MultiAgentWorkflowStatus,
    RoutingDecision,
    SharedExecutionContext,
)
from onusfit_ai.shared.contracts.common import Usage


def reduce_agent_results(
    existing: list[AgentExecutionResultItem],
    incoming: list[AgentExecutionResultItem],
) -> list[AgentExecutionResultItem]:
    """Merge specialist task outcomes by task_id preserving execution order."""
    if not incoming:
        return existing
    if not existing:
        return list(incoming)
    by_id: dict[str, AgentExecutionResultItem] = {r.task_id: r for r in existing}
    ordered_ids = [r.task_id for r in existing]
    for item in incoming:
        if item.task_id not in by_id:
            ordered_ids.append(item.task_id)
        by_id[item.task_id] = item
    return [by_id[tid] for tid in ordered_ids]


def reduce_evidence(
    existing: list[EvidenceItem],
    incoming: list[EvidenceItem],
) -> list[EvidenceItem]:
    """Append verified evidence items deduplicated by agent, tool, and normalized summary."""
    if not incoming:
        return existing
    if not existing:
        return list(incoming)
    seen = {(e.source_agent, e.source_tool, e.summary.strip().lower()) for e in existing}
    merged = list(existing)
    for item in incoming:
        key = (item.source_agent, item.source_tool, item.summary.strip().lower())
        if key not in seen:
            seen.add(key)
            merged.append(item)
    return merged


def reduce_recommendations(
    existing: list[AgentRecommendation],
    incoming: list[AgentRecommendation],
) -> list[AgentRecommendation]:
    """Merge specialist recommendations deduplicating by role, domain, and summary."""
    if not incoming:
        return existing
    if not existing:
        return list(incoming)
    seen = {(r.agent_role, r.domain, r.summary.strip().lower()) for r in existing}
    merged = list(existing)
    for rec in incoming:
        key = (rec.agent_role, rec.domain, rec.summary.strip().lower())
        if key not in seen:
            seen.add(key)
            merged.append(rec)
    return merged


def reduce_unique_strings(existing: list[str], incoming: list[str]) -> list[str]:
    """Accumulate unique strings (task IDs, tool names) preserving insertion order."""
    if not incoming:
        return existing
    if not existing:
        return list(incoming)
    seen = set(existing)
    merged = list(existing)
    for val in incoming:
        if val not in seen:
            seen.add(val)
            merged.append(val)
    return merged


class MultiAgentGraphState(TypedDict):
    """Request-scoped typed state for the bounded LangGraph supervisor workflow."""

    trace_id: str
    request_id: str
    user_id: str
    shared_context: SharedExecutionContext
    routing_decision: RoutingDecision | None
    pending_tasks: list[DelegatedTask]
    completed_task_ids: Annotated[list[str], reduce_unique_strings]
    executed_signatures: Annotated[list[str], reduce_unique_strings]
    agent_results: Annotated[list[AgentExecutionResultItem], reduce_agent_results]
    evidence: Annotated[list[EvidenceItem], reduce_evidence]
    recommendations: Annotated[list[AgentRecommendation], reduce_recommendations]
    conflicts_resolved: list[ContextConflict]
    executed_tools: Annotated[list[str], reduce_unique_strings]
    replan_attempts: int
    max_replanning_attempts: int
    needs_replan: bool
    status: MultiAgentWorkflowStatus
    termination_reason: MultiAgentTerminationReason | None
    response: CoachChatResult | None
    usage: Usage | None
    error_message: str | None
    partial_results: bool
    medical_halted: bool


def create_initial_multi_agent_state(
    *,
    shared_context: SharedExecutionContext,
    max_replanning_attempts: int = 1,
) -> MultiAgentGraphState:
    """Create a clean, isolated initial multi-agent state for a single request."""
    return MultiAgentGraphState(
        trace_id=shared_context.trace_id,
        request_id=shared_context.request_id,
        user_id=shared_context.user_id,
        shared_context=shared_context,
        routing_decision=None,
        pending_tasks=[],
        completed_task_ids=[],
        executed_signatures=[],
        agent_results=[],
        evidence=list(shared_context.evidence),
        recommendations=list(shared_context.recommendations),
        conflicts_resolved=[],
        executed_tools=[],
        replan_attempts=0,
        max_replanning_attempts=max_replanning_attempts,
        needs_replan=False,
        status=MultiAgentWorkflowStatus.IDLE,
        termination_reason=None,
        response=None,
        usage=None,
        error_message=None,
        partial_results=False,
        medical_halted=bool(shared_context.medical_red_flags),
    )
