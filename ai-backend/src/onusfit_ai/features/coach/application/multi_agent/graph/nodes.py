"""LangGraph node implementations for FitOnus Multi-Agent Coach (Stage 05)."""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from langchain_core.runnables import RunnableConfig

from onusfit_ai.features.coach.application.multi_agent.agents import (
    BaseSpecialistAgent,
    SupervisorAgent,
)
from onusfit_ai.features.coach.application.multi_agent.budgets import (
    CumulativeBudgetTracker,
    contains_prompt_injection,
)
from onusfit_ai.features.coach.application.multi_agent.context import (
    deduplicate_evidence,
    resolve_recommendation_conflicts,
)
from onusfit_ai.features.coach.application.multi_agent.graph.state import (
    MultiAgentGraphState,
)
from onusfit_ai.features.coach.application.multi_agent.mcp_gateway import (
    MultiAgentMcpGateway,
)
from onusfit_ai.features.coach.application.multi_agent.router import SupervisorRouter
from onusfit_ai.features.coach.application.multi_agent.telemetry import (
    MultiAgentTelemetry,
)
from onusfit_ai.features.coach.domain.chat import CoachChatRequest
from onusfit_ai.features.coach.domain.multi_agent import (
    A2AMediatorProtocol,
    AgentCapability,
    AgentExecutionResultItem,
    AgentRecommendation,
    AgentRole,
    DelegatedTask,
    DelegatedTaskStatus,
    EvidenceItem,
    MultiAgentTerminationReason,
    MultiAgentWorkflowStatus,
    OrchestrationMode,
)
from onusfit_ai.shared.contracts.common import Usage
from onusfit_ai.shared.llm.ports import MediaInput, TextGenerator

logger = logging.getLogger("onusfit_ai.coach.multi_agent.nodes")

_ROLE_BY_VALUE: dict[str, AgentRole] = {role.value: role for role in AgentRole}


@dataclass
class MultiAgentRuntimeContext:
    """Request-scoped dependencies injected via RunnableConfig.configurable."""

    request: CoachChatRequest
    llm: TextGenerator
    router: SupervisorRouter
    supervisor: SupervisorAgent
    specialists: dict[AgentRole, BaseSpecialistAgent]
    a2a_mediator: A2AMediatorProtocol
    gateway: MultiAgentMcpGateway
    budget: CumulativeBudgetTracker
    telemetry: MultiAgentTelemetry
    available_agents: set[AgentRole]
    clock: Callable[[], float]
    media: list[MediaInput] | None = None


def _get_ctx(config: RunnableConfig) -> MultiAgentRuntimeContext:
    ctx = config.get("configurable", {}).get("multi_agent_ctx")
    if not isinstance(ctx, MultiAgentRuntimeContext):
        raise RuntimeError("Missing MultiAgentRuntimeContext in RunnableConfig")
    return ctx


def _task_signature(task: DelegatedTask) -> str:
    deps = ",".join(sorted(task.depends_on))
    return f"{task.target_agent.value}:{task.task_type}:{deps}"


def _has_dependency_cycle(tasks: list[DelegatedTask]) -> bool:
    """Detect circular task dependencies via Kahn topological check."""
    task_ids = {t.task_id for t in tasks}
    indegree: dict[str, int] = {t.task_id: 0 for t in tasks}
    dependents: dict[str, list[str]] = {t.task_id: [] for t in tasks}

    for task in tasks:
        for dep in task.depends_on:
            if dep == task.task_id:
                return True
            if dep in task_ids:
                indegree[task.task_id] += 1
                dependents[dep].append(task.task_id)

    queue = [tid for tid, deg in indegree.items() if deg == 0]
    visited = 0
    while queue:
        curr = queue.pop(0)
        visited += 1
        for nxt in dependents[curr]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                queue.append(nxt)
    return visited != len(tasks)


def _check_halt_state(
    ctx: MultiAgentRuntimeContext,
    trace_id: str,
) -> tuple[MultiAgentWorkflowStatus, MultiAgentTerminationReason] | None:
    if ctx.budget.is_cancelled or ctx.a2a_mediator.is_cancelled(trace_id):
        return (
            MultiAgentWorkflowStatus.CANCELLED,
            MultiAgentTerminationReason.CANCELLED,
        )
    if ctx.budget.is_deadline_approaching():
        return (
            MultiAgentWorkflowStatus.DEADLINE_EXCEEDED,
            MultiAgentTerminationReason.DEADLINE_APPROACHING,
        )
    reason = ctx.budget.exhausted_reason
    if reason == "token_budget_exceeded":
        return (
            MultiAgentWorkflowStatus.BUDGET_EXCEEDED,
            MultiAgentTerminationReason.TOKEN_BUDGET_EXCEEDED,
        )
    if reason == "max_agent_invocations_reached":
        return (
            MultiAgentWorkflowStatus.BUDGET_EXCEEDED,
            MultiAgentTerminationReason.MAX_AGENT_INVOCATIONS_REACHED,
        )
    if reason == "max_tool_calls_reached":
        return (
            MultiAgentWorkflowStatus.BUDGET_EXCEEDED,
            MultiAgentTerminationReason.MAX_TOOL_CALLS_REACHED,
        )
    if reason == "max_llm_calls_reached":
        return (
            MultiAgentWorkflowStatus.BUDGET_EXCEEDED,
            MultiAgentTerminationReason.MAX_LLM_CALLS_REACHED,
        )
    if reason == "max_delegation_depth_reached":
        return (
            MultiAgentWorkflowStatus.BUDGET_EXCEEDED,
            MultiAgentTerminationReason.MAX_DELEGATION_DEPTH_REACHED,
        )
    return None


async def interpret_intent_node(
    state: MultiAgentGraphState,
    config: RunnableConfig,
) -> dict[str, Any]:
    """Stage 05 Step 1: Validate runtime signals and interpret request intent."""
    ctx = _get_ctx(config)
    halt = _check_halt_state(ctx, state["trace_id"])
    if halt is not None:
        return {"status": halt[0], "termination_reason": halt[1]}

    shared = state["shared_context"]
    if contains_prompt_injection(ctx.request.message):
        ctx.telemetry.error_categories.append("prompt_injection_sanitized")
    return {
        "status": MultiAgentWorkflowStatus.ROUTING,
        "medical_halted": bool(shared.medical_red_flags),
    }


async def select_agents_node(
    state: MultiAgentGraphState,
    config: RunnableConfig,
) -> dict[str, Any]:
    """Stage 05 Step 2: Supervisor deterministic routing + A2A capability discovery."""
    ctx = _get_ctx(config)
    halt = _check_halt_state(ctx, state["trace_id"])
    if halt is not None:
        return {"status": halt[0], "termination_reason": halt[1], "pending_tasks": []}

    shared = state["shared_context"]
    # Register specialist handlers on A2AMediator so discovery reflects live availability
    for role, specialist in ctx.specialists.items():
        ctx.a2a_mediator.register_agent(
            role.value,
            specialist.as_a2a_handler(shared),
            role=role.value,
            description=specialist.description,
            capabilities=[cap.value for cap in specialist.capabilities],
            available=role in ctx.available_agents,
            supports_parallel=specialist.supports_parallel,
        )

    cards = ctx.a2a_mediator.discover_agents(only_available=True)
    discovered_roles = {
        _ROLE_BY_VALUE[str(getattr(card, "agent_id", ""))]
        for card in cards
        if str(getattr(card, "agent_id", "")) in _ROLE_BY_VALUE
    }
    effective_available = (
        ctx.available_agents & discovered_roles if discovered_roles else ctx.available_agents
    )

    decision = ctx.router.route(
        shared,
        available_agents=effective_available,
        budget=ctx.budget.budget,
    )
    ctx.telemetry.record_routing(
        mode=decision.mode.value,
        goal_type=decision.goal_type,
        language=decision.language,
        selected_agents=[r.value for r in decision.selected_agents],
    )

    if decision.mode == OrchestrationMode.BYPASS or not decision.tasks:
        return {
            "routing_decision": decision,
            "pending_tasks": [],
            "status": MultiAgentWorkflowStatus.BYPASSED,
            "termination_reason": MultiAgentTerminationReason.SIMPLE_QUERY_BYPASS,
        }

    return {
        "routing_decision": decision,
        "pending_tasks": list(decision.tasks),
        "status": MultiAgentWorkflowStatus.DELEGATING,
    }


async def delegate_tasks_node(
    state: MultiAgentGraphState,
    config: RunnableConfig,
) -> dict[str, Any]:
    """Stage 05 Step 3: Filter duplicate tasks, detect cycles, and prepare DAG."""
    ctx = _get_ctx(config)
    halt = _check_halt_state(ctx, state["trace_id"])
    if halt is not None:
        return {"status": halt[0], "termination_reason": halt[1], "pending_tasks": []}

    completed_ids = set(state.get("completed_task_ids", []))
    seen_sigs = set(state.get("executed_signatures", []))

    filtered: list[DelegatedTask] = []
    for task in state.get("pending_tasks", []):
        sig = _task_signature(task)
        if task.task_id in completed_ids or sig in seen_sigs:
            continue
        filtered.append(task)
        seen_sigs.add(sig)

    if _has_dependency_cycle(filtered):
        return {
            "pending_tasks": [],
            "status": MultiAgentWorkflowStatus.FAILED,
            "termination_reason": MultiAgentTerminationReason.CIRCULAR_DELEGATION_BLOCKED,
            "error_message": "Circular task delegation prevented",
        }

    return {
        "pending_tasks": filtered,
        "status": MultiAgentWorkflowStatus.EXECUTING,
    }


async def execute_tasks_node(
    state: MultiAgentGraphState,
    config: RunnableConfig,
) -> dict[str, Any]:
    """Stage 05 Step 4: Execute DAG via A2AMediator with dependency & budget enforcement."""
    ctx = _get_ctx(config)
    trace_id = state["trace_id"]
    halt = _check_halt_state(ctx, trace_id)
    if halt is not None:
        return {"status": halt[0], "termination_reason": halt[1], "pending_tasks": []}

    tasks = list(state.get("pending_tasks", []))
    if not tasks:
        return {"pending_tasks": []}

    task_by_id = {t.task_id: t for t in tasks}
    dag_specs = [
        {
            "task_id": t.task_id,
            "sender": AgentRole.SUPERVISOR.value,
            "recipient": t.target_agent.value,
            "task": {
                "task_id": t.task_id,
                "task_type": t.task_type,
                "instructions": t.instructions,
                "input_data": dict(t.input_data),
                "constraints": list(t.constraints),
                "required_capabilities": [c.value for c in t.required_capabilities],
                "user_id": state["user_id"],
                "correlation_id": trace_id,
                "depth": 1,
                "delegation_chain": [],
                "timeout_seconds": t.timeout_seconds,
            },
            "depends_on": list(t.depends_on),
            "dependency_type": t.dependency_type,
        }
        for t in tasks
    ]

    decision = state.get("routing_decision")
    if decision and decision.mode in (OrchestrationMode.PARALLEL, OrchestrationMode.HYBRID):
        ctx.telemetry.parallel_batches += 1

    responses = await ctx.a2a_mediator.execute_task_dag(
        dag_specs,
        conversation_id=trace_id,
        max_concurrency=ctx.budget.budget.max_concurrent_agents,
        max_depth=ctx.budget.budget.max_delegation_depth,
        deadline=ctx.budget.deadline,
    )
    ctx.telemetry.delegation_count += len(responses)

    new_results: list[AgentExecutionResultItem] = []
    new_evidence: list[EvidenceItem] = []
    new_recs: list[AgentRecommendation] = []
    new_tools: list[str] = []
    done_ids: list[str] = []
    done_sigs: list[str] = []

    for resp in responses:
        task_id = str(getattr(resp, "task_id", ""))
        orig_task = task_by_id.get(task_id)
        if orig_task is not None:
            done_ids.append(task_id)
            done_sigs.append(_task_signature(orig_task))

        out_data = getattr(resp, "output_data", {}) or {}
        resp_status = str(getattr(resp, "status", "failed"))
        if (
            isinstance(out_data, dict)
            and "task_id" in out_data
            and "agent_role" in out_data
            and "status" in out_data
        ):
            item = AgentExecutionResultItem.model_validate(out_data)
            updates: dict[str, Any] = {}
            if resp_status in ("failed", "refused", "cancelled"):
                updates["status"] = DelegatedTaskStatus(resp_status)
                err_msg = getattr(resp, "error_message", None)
                if err_msg:
                    updates["error_message"] = err_msg
                updates["recommendations"] = []
            if getattr(resp, "deduplicated", False) and not item.deduplicated:
                updates["deduplicated"] = True
            if item.duration_ms == 0.0 and getattr(resp, "execution_time_ms", 0.0) > 0.0:
                updates["duration_ms"] = round(float(resp.execution_time_ms), 2)
            if updates:
                item = item.model_copy(update=updates)
        else:
            sender = str(getattr(resp, "sender_agent", "") or "")
            role = _ROLE_BY_VALUE.get(
                sender, orig_task.target_agent if orig_task else AgentRole.SUPERVISOR
            )
            raw_status = str(getattr(resp, "status", "failed"))
            try:
                mapped_status = DelegatedTaskStatus(raw_status)
            except ValueError:
                mapped_status = DelegatedTaskStatus.FAILED
            item = AgentExecutionResultItem(
                task_id=task_id,
                agent_role=role,
                correlation_id=str(getattr(resp, "correlation_id", "") or trace_id),
                status=mapped_status,
                output_data=out_data if isinstance(out_data, dict) else {},
                duration_ms=round(float(getattr(resp, "execution_time_ms", 0.0) or 0.0), 2),
                error_message=getattr(resp, "error_message", None),
                partial=bool(getattr(resp, "partial", False)),
                deduplicated=bool(getattr(resp, "deduplicated", False)),
            )

        ctx.telemetry.record_agent_result(
            agent_role=item.agent_role.value,
            status=item.status.value,
            duration_ms=item.duration_ms,
            failed=item.status in (DelegatedTaskStatus.FAILED, DelegatedTaskStatus.REFUSED),
            error_category=(
                f"{item.agent_role.value}_{item.status.value}"
                if item.status in (DelegatedTaskStatus.FAILED, DelegatedTaskStatus.REFUSED)
                else None
            ),
        )
        new_results.append(item)
        new_evidence.extend(item.evidence)
        new_recs.extend(item.recommendations)
        new_tools.extend(item.tool_calls)

    return {
        "pending_tasks": [],
        "completed_task_ids": done_ids,
        "executed_signatures": done_sigs,
        "agent_results": new_results,
        "evidence": new_evidence,
        "recommendations": new_recs,
        "executed_tools": new_tools,
        "status": MultiAgentWorkflowStatus.AGGREGATING,
    }


async def aggregate_results_node(
    state: MultiAgentGraphState,
    config: RunnableConfig,
) -> dict[str, Any]:
    """Stage 05 Step 5: Deduplicate evidence and resolve inter-agent conflicts."""
    _ = _get_ctx(config)
    deduped_evidence = deduplicate_evidence(list(state.get("evidence", [])))
    resolved_recs, conflicts = resolve_recommendation_conflicts(
        list(state.get("recommendations", []))
    )

    results = list(state.get("agent_results", []))
    has_failed = any(
        r.status in (DelegatedTaskStatus.FAILED, DelegatedTaskStatus.REFUSED) for r in results
    )
    has_partial_flag = any(r.partial or r.status == DelegatedTaskStatus.PARTIAL for r in results)
    medical_halted = (
        bool(state.get("medical_halted"))
        or any(bool(r.output_data.get("medical_halted")) for r in results)
        or any("medical_red_flag_halt" in rec.constraints_applied for rec in resolved_recs)
    )

    updated_shared = state["shared_context"].model_copy(
        update={
            "evidence": deduped_evidence,
            "recommendations": resolved_recs,
            "conflicts_resolved": conflicts,
        }
    )

    return {
        "shared_context": updated_shared,
        "evidence": deduped_evidence,
        "recommendations": resolved_recs,
        "conflicts_resolved": conflicts,
        "partial_results": has_failed or has_partial_flag,
        "medical_halted": medical_halted,
        "status": MultiAgentWorkflowStatus.VALIDATING,
    }


async def validate_results_node(
    state: MultiAgentGraphState,
    config: RunnableConfig,
) -> dict[str, Any]:
    """Stage 05 Step 6: Enforce safety, budgets, and bounded replan eligibility."""
    ctx = _get_ctx(config)
    halt = _check_halt_state(ctx, state["trace_id"])
    if halt is not None:
        return {
            "needs_replan": False,
            "status": halt[0],
            "termination_reason": halt[1],
        }

    if state.get("medical_halted"):
        return {
            "needs_replan": False,
            "status": MultiAgentWorkflowStatus.COMPLETED,
            "termination_reason": MultiAgentTerminationReason.MEDICAL_RED_FLAG_HALT,
        }

    results = list(state.get("agent_results", []))
    failed_results = [
        r for r in results if r.status in (DelegatedTaskStatus.FAILED, DelegatedTaskStatus.REFUSED)
    ]

    # Check circular delegation error from A2A mediator
    if any(
        r.error_message and "circular delegation" in r.error_message.lower() for r in failed_results
    ):
        return {
            "needs_replan": False,
            "status": MultiAgentWorkflowStatus.FAILED,
            "termination_reason": MultiAgentTerminationReason.CIRCULAR_DELEGATION_BLOCKED,
        }

    replan_attempts = state.get("replan_attempts", 0)
    max_replans = state.get("max_replanning_attempts", 1)
    snap = ctx.budget.snapshot()

    can_recover_with_knowledge = (
        bool(failed_results)
        and replan_attempts < max_replans
        and snap.agent_invocations < ctx.budget.budget.max_agent_invocations
        and not ctx.budget.is_deadline_approaching()
        and AgentRole.KNOWLEDGE in ctx.available_agents
        and "task_knowledge_recovery" not in state.get("completed_task_ids", [])
    )

    if can_recover_with_knowledge:
        return {
            "needs_replan": True,
            "status": MultiAgentWorkflowStatus.REPLANNING,
        }

    if state.get("partial_results"):
        return {
            "needs_replan": False,
            "status": MultiAgentWorkflowStatus.PARTIAL,
            "termination_reason": MultiAgentTerminationReason.PARTIAL_RESULTS_RETURNED,
        }

    return {
        "needs_replan": False,
        "status": MultiAgentWorkflowStatus.SYNTHESIZING,
        "termination_reason": MultiAgentTerminationReason.GOAL_SATISFIED,
    }


async def replan_tasks_node(
    state: MultiAgentGraphState,
    config: RunnableConfig,
) -> dict[str, Any]:
    """Stage 05 Recovery: Schedule one safe non-redundant recovery task on failure."""
    ctx = _get_ctx(config)
    reserved = await ctx.budget.reserve_replan()
    if not reserved:
        return {
            "needs_replan": False,
            "pending_tasks": [],
            "status": MultiAgentWorkflowStatus.PARTIAL,
            "termination_reason": MultiAgentTerminationReason.MAX_REPLANS_REACHED,
        }

    ctx.telemetry.replans_count += 1
    recovery_task = DelegatedTask(
        task_id="task_knowledge_recovery",
        target_agent=AgentRole.KNOWLEDGE,
        task_type="retrieve_recovery_grounding",
        instructions="Provide safe evidence-based fitness guidance after partial failure.",
        required_capabilities=[AgentCapability.KNOWLEDGE_RETRIEVAL],
        priority=3,
    )
    return {
        "replan_attempts": state.get("replan_attempts", 0) + 1,
        "needs_replan": False,
        "pending_tasks": [recovery_task],
        "status": MultiAgentWorkflowStatus.DELEGATING,
    }


async def final_synthesis_node(
    state: MultiAgentGraphState,
    config: RunnableConfig,
) -> dict[str, Any]:
    """Stage 05 Step 7: Synthesize single cohesive multilingual CoachChatResult."""
    ctx = _get_ctx(config)
    shared = state["shared_context"]
    recs = list(state.get("recommendations", []))
    evidence = list(state.get("evidence", []))
    conflicts = list(state.get("conflicts_resolved", []))
    executed_tools = list(state.get("executed_tools", []))
    has_medical = bool(state.get("medical_halted") or shared.medical_red_flags)

    cancelled = ctx.budget.is_cancelled or ctx.a2a_mediator.is_cancelled(state["trace_id"])
    if cancelled:
        coach_res = ctx.supervisor._deterministic_fallback_result(
            shared_ctx=shared,
            recommendations=recs,
            evidence=evidence,
            executed_tools=executed_tools,
            has_medical=has_medical,
        )
        llm_res = None
        status = MultiAgentWorkflowStatus.CANCELLED
        term_reason = MultiAgentTerminationReason.CANCELLED
    else:
        coach_res, llm_res = await ctx.supervisor.synthesize(
            request=ctx.request,
            shared_ctx=shared,
            recommendations=recs,
            evidence=evidence,
            conflicts=conflicts,
            executed_tools=executed_tools,
            llm=ctx.llm,
            budget=ctx.budget,
            media=ctx.media,
        )
        status = state.get("status", MultiAgentWorkflowStatus.COMPLETED)
        if status in (
            MultiAgentWorkflowStatus.IDLE,
            MultiAgentWorkflowStatus.SYNTHESIZING,
            MultiAgentWorkflowStatus.VALIDATING,
        ):
            status = (
                MultiAgentWorkflowStatus.PARTIAL
                if state.get("partial_results")
                else MultiAgentWorkflowStatus.COMPLETED
            )
        term_reason = state.get("termination_reason") or MultiAgentTerminationReason.GOAL_SATISFIED
        if state.get("medical_halted"):
            term_reason = MultiAgentTerminationReason.MEDICAL_RED_FLAG_HALT

    snap = ctx.budget.snapshot()
    model_used = llm_res.usage.model if llm_res is not None else ctx.request.model.primary
    is_fallback_model = llm_res.usage.is_fallback if llm_res is not None else False
    cached_tok = llm_res.usage.cached_tokens if llm_res is not None else 0
    thinking_tok = llm_res.usage.thinking_tokens if llm_res is not None else 0

    usage = Usage(
        model=model_used,
        is_fallback=is_fallback_model,
        input_tokens=snap.input_tokens,
        output_tokens=snap.output_tokens,
        cached_tokens=cached_tok,
        thinking_tokens=thinking_tok,
        total_tokens=snap.total_tokens,
        duration_ms=round(max(0.0, (ctx.clock() - ctx.budget.start_time) * 1000.0)),
    )

    ctx.telemetry.llm_calls_count = snap.llm_calls
    ctx.telemetry.tool_calls_count = snap.tool_calls
    ctx.telemetry.tool_failures_count = ctx.gateway.tool_failures
    ctx.telemetry.tool_cache_hits = ctx.gateway.cache_hits
    ctx.telemetry.input_tokens = snap.input_tokens
    ctx.telemetry.output_tokens = snap.output_tokens
    ctx.telemetry.total_tokens = snap.total_tokens
    ctx.telemetry.termination_reason = term_reason.value
    ctx.telemetry.outcome = (
        "error"
        if status == MultiAgentWorkflowStatus.FAILED
        else ("cancelled" if status == MultiAgentWorkflowStatus.CANCELLED else "ok")
    )

    return {
        "response": coach_res,
        "usage": usage,
        "status": status,
        "termination_reason": term_reason,
    }
