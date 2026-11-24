"""Typed graph state and reducers for FitOnus LangGraph agent workflows.

FitOnus Phase 10: LangGraph Agent Workflows — Stage 02.
Maintains typed, immutable graph state transitions across workflow nodes.
Uses custom reducers for append-only and mergeable fields (observations, steps,
executed tool signatures, tool execution results).
Framework-independent domain contracts remain strictly in domain/agent.py.
"""

import time
from typing import Annotated, TypedDict

from onusfit_ai.features.coach.domain.agent import (
    AgentExecutionStatus,
    AgentGoal,
    AgentState,
    AgentTerminationReason,
    PlanStep,
    TaskPlan,
    ToolObservation,
)
from onusfit_ai.features.coach.domain.agent import (
    ToolExecutionResult as DomainToolResult,
)
from onusfit_ai.features.coach.domain.chat import (
    CoachChatRequest,
    CoachChatResult,
)
from onusfit_ai.shared.contracts.common import Usage


# -----------------------------------------------------------------------------
# State Reducers
# -----------------------------------------------------------------------------
def reduce_observations(
    existing: list[ToolObservation],
    incoming: list[ToolObservation],
) -> list[ToolObservation]:
    """Merges new tool observations into existing list, deduplicating by step_id and tool_name."""
    if not incoming:
        return existing
    if not existing:
        return list(incoming)

    existing_keys = {(obs.step_id, obs.tool_name) for obs in existing}
    merged = list(existing)
    for obs in incoming:
        key = (obs.step_id, obs.tool_name)
        if key not in existing_keys:
            merged.append(obs)
            existing_keys.add(key)
    return merged


def reduce_steps(
    existing: list[PlanStep],
    incoming: list[PlanStep],
) -> list[PlanStep]:
    """Merges or updates plan steps by step_id, preserving step order."""
    if not incoming:
        return existing
    if not existing:
        return list(incoming)

    step_map = {step.step_id: step for step in existing}
    for step in incoming:
        step_map[step.step_id] = step
    return sorted(step_map.values(), key=lambda s: s.step_id)


def reduce_executed_tools(
    existing: list[str],
    incoming: list[str],
) -> list[str]:
    """Accumulates unique executed action signatures (tool_name:sorted_json_args)."""
    if not incoming:
        return existing
    if not existing:
        return list(incoming)

    seen = set(existing)
    result = list(existing)
    for item in incoming:
        if item not in seen:
            result.append(item)
            seen.add(item)
    return result


def reduce_tool_results(
    existing: list[DomainToolResult],
    incoming: list[DomainToolResult],
) -> list[DomainToolResult]:
    """Appends newly executed domain tool results."""
    if not incoming:
        return existing
    if not existing:
        return list(incoming)
    return existing + incoming


def reduce_int_sum(existing: int, incoming: int) -> int:
    """Accumulates integer metrics such as total tool calls or tokens."""
    return existing + incoming


# -----------------------------------------------------------------------------
# Graph Agent State Definition
# -----------------------------------------------------------------------------
class GraphAgentState(TypedDict, total=False):
    """Request-scoped LangGraph state for FitOnus coach workflow execution.

    Maintains total isolation between requests. Annotations define field-specific
    reducers when nodes return partial updates.
    """

    # Request Identity & Tracking
    trace_id: str
    user_id: str
    start_time: float
    deadline: float

    # Goal & Planning
    goal: AgentGoal | None
    plan: TaskPlan | None

    # Lifecycle Status
    status: AgentExecutionStatus
    termination_reason: AgentTerminationReason | None

    # Reducer-managed Collections
    steps: Annotated[list[PlanStep], reduce_steps]
    observations: Annotated[list[ToolObservation], reduce_observations]
    executed_tools: Annotated[list[str], reduce_executed_tools]
    executed_tool_results: Annotated[list[DomainToolResult], reduce_tool_results]

    # Metrics & Iteration Counters
    iteration: int
    replans_count: int
    total_tool_calls: Annotated[int, reduce_int_sum]
    accumulated_tokens: Annotated[int, reduce_int_sum]

    # Replanning Evaluation Signals
    needs_replanning: bool
    replan_reason: str | None
    missing_data_domains: list[str]
    new_steps: list[PlanStep]

    # Error & Recovery Signals
    error: str | None
    node_failures: list[str]

    # Final Output
    response: CoachChatResult | None
    usage: Usage | None


def create_initial_graph_state(
    request: CoachChatRequest,
    *,
    trace_id: str,
    user_id: str,
    start_time: float,
    deadline: float,
    initial_goal: AgentGoal | None = None,
    initial_observations: list[ToolObservation] | None = None,
    initial_executed_tools: list[str] | None = None,
    initial_tool_results: list[DomainToolResult] | None = None,
) -> GraphAgentState:
    """Builds a fresh, request-scoped GraphAgentState initialized with zero leaks."""
    return GraphAgentState(
        trace_id=trace_id,
        user_id=user_id,
        start_time=start_time,
        deadline=deadline,
        goal=initial_goal,
        plan=None,
        status=AgentExecutionStatus.IDLE,
        termination_reason=None,
        steps=[],
        observations=list(initial_observations or []),
        executed_tools=list(initial_executed_tools or []),
        executed_tool_results=list(initial_tool_results or []),
        iteration=0,
        replans_count=0,
        total_tool_calls=len(initial_tool_results or []),
        accumulated_tokens=0,
        needs_replanning=False,
        replan_reason=None,
        missing_data_domains=[],
        new_steps=[],
        error=None,
        node_failures=[],
        response=None,
        usage=None,
    )


def graph_state_to_domain_state(state: GraphAgentState) -> AgentState:
    """Converts GraphAgentState into the domain AgentState contract."""
    raw_goal = state.get("goal")
    if raw_goal is not None:
        effective_goal = raw_goal
    else:
        effective_goal = AgentGoal(
            goal_type="simple_qa",  # type: ignore[arg-type]
            target_description="Unknown",
            language="en",
            requires_agent_execution=False,
            confidence=1.0,
            target_domains=[],
        )

    return AgentState(
        trace_id=state.get("trace_id", "unknown_trace"),
        user_id=state.get("user_id", "authenticated_user"),
        goal=effective_goal,
        plan=state.get("plan"),
        iteration=state.get("iteration", 0),
        replans_count=state.get("replans_count", 0),
        steps=list(state.get("steps", [])),
        observations=list(state.get("observations", [])),
        executed_tools=list(state.get("executed_tools", [])),
        status=state.get("status", AgentExecutionStatus.IDLE),
        termination_reason=state.get("termination_reason"),
        total_tool_calls=state.get("total_tool_calls", 0),
        accumulated_tokens=state.get("accumulated_tokens", 0),
        start_time=state.get("start_time", time.monotonic()),
    )
