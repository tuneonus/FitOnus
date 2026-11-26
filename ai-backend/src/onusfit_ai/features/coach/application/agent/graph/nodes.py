"""Reusable execution nodes for FitOnus LangGraph agent workflows.

FitOnus Phase 10: LangGraph Agent Workflows — Stage 03 & 05.
Implements modular graph nodes:
1. InterpretGoalNode: Goal intent classification, language detection, and bypass checks.
2. TaskPlanningNode: Bounded task plan creation with validated tool dependencies.
3. ToolExecutionNode: Parallel tool execution, argument validation, duplicate caching.
4. ObservationProcessingNode: Evaluates goal fulfillment, data gaps, and replan triggers.
5. ReplanningNode: Expands search windows and injects adaptive recovery steps.
6. FinalSynthesisNode: Grounded synthesis strictly based on gathered observations.
"""

import asyncio
import json
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from langchain_core.runnables import RunnableConfig
from pydantic import ValidationError

from onusfit_ai.features.coach.application.agent.executor import (
    _CONCURRENCY_LIMIT,
    _MIN_DEADLINE_MARGIN_S,
    build_agent_synthesis_prompt,
)
from onusfit_ai.features.coach.application.agent.graph.state import GraphAgentState
from onusfit_ai.features.coach.application.agent.graph.telemetry import (
    GraphExecutionTelemetry,
)
from onusfit_ai.features.coach.application.agent.observer import AgentObserver
from onusfit_ai.features.coach.application.agent.planner import AgentPlanner
from onusfit_ai.features.coach.application.schemas import GeminiCoachReplyOutput
from onusfit_ai.features.coach.domain.agent import (
    AgentBudgetConfig,
    AgentExecutionStatus,
    AgentGoal,
    AgentTerminationReason,
    PlanStep,
    StepStatus,
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
from onusfit_ai.shared.contracts.tools import (
    TOOL_ARG_SCHEMAS,
    TOOL_SOURCE_LABELS,
)
from onusfit_ai.shared.llm.ports import (
    LlmResult,
    LlmServiceError,
    TextGenerator,
    sanitize_tool_error,
)
from onusfit_ai.shared.logging import metrics_registry
from onusfit_ai.shared.utils.js_compat import strict_json_loads, strip_code_fences

logger = logging.getLogger("onusfit_ai.agent.graph.nodes")


@dataclass
class GraphRuntimeContext:
    """Execution context injected into the graph via RunnableConfig['configurable']."""

    planner: AgentPlanner
    observer: AgentObserver
    budget: AgentBudgetConfig
    llm: TextGenerator
    request: CoachChatRequest
    tool_handler: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]] | None
    clock: Callable[[], float] = field(default=time.monotonic)
    telemetry: GraphExecutionTelemetry | None = None
    tool_cache: dict[str, dict[str, Any]] = field(default_factory=dict)


def _get_context(config: RunnableConfig | None) -> GraphRuntimeContext:
    """Safely retrieves the injected GraphRuntimeContext."""
    if not config or "configurable" not in config:
        raise RuntimeError("GraphRuntimeContext missing from RunnableConfig['configurable'].")
    ctx = config["configurable"].get("graph_context")
    if not isinstance(ctx, GraphRuntimeContext):
        raise TypeError(f"Invalid graph_context type: {type(ctx)}")
    return ctx


# -----------------------------------------------------------------------------
# Node 1: Interpret Goal
# -----------------------------------------------------------------------------
async def interpret_goal_node(
    state: GraphAgentState,
    config: RunnableConfig | None = None,
) -> dict[str, Any]:
    """Interprets user intent, detects language, and determines if agent execution is needed."""
    ctx = _get_context(config)
    start_t = ctx.clock()
    node_name = "interpret_goal"

    try:
        goal = ctx.planner.interpret_goal(ctx.request.message, ctx.request.context)
        if ctx.telemetry:
            ctx.telemetry.record_node_end(node_name, start_t, success=True)

        if not goal.requires_agent_execution:
            return {
                "goal": goal,
                "status": AgentExecutionStatus.BYPASSED,
                "termination_reason": AgentTerminationReason.SIMPLE_QUERY_BYPASS,
            }

        return {
            "goal": goal,
            "status": AgentExecutionStatus.PLANNING,
        }
    except Exception as exc:
        logger.exception("Error in interpret_goal_node: %s", exc)
        if ctx.telemetry:
            ctx.telemetry.record_node_end(
                node_name, start_t, success=False, error_category="goal_interpretation_error"
            )
        default_goal = AgentGoal(
            goal_type="simple_qa",  # type: ignore[arg-type]
            target_description="Fallback goal interpretation",
            language="en",
            requires_agent_execution=False,
            confidence=0.5,
            target_domains=[],
        )
        return {
            "goal": default_goal,
            "status": AgentExecutionStatus.FAILED,
            "error": str(exc),
            "node_failures": [node_name],
        }


# -----------------------------------------------------------------------------
# Node 2: Task Planning
# -----------------------------------------------------------------------------
async def task_planning_node(
    state: GraphAgentState,
    config: RunnableConfig | None = None,
) -> dict[str, Any]:
    """Generates a bounded execution plan tailored to the interpreted goal."""
    ctx = _get_context(config)
    start_t = ctx.clock()
    node_name = "task_planning"

    goal = state.get("goal")
    if not goal:
        return {
            "status": AgentExecutionStatus.FAILED,
            "termination_reason": AgentTerminationReason.UNEXPECTED_ERROR,
            "error": "Cannot plan without an interpreted goal",
            "node_failures": [node_name],
        }

    try:
        plan = ctx.planner.create_plan(goal, ctx.request.message, ctx.request.context)
        if ctx.telemetry:
            ctx.telemetry.record_node_end(node_name, start_t, success=True)

        return {
            "plan": plan,
            "steps": list(plan.steps),
            "status": AgentExecutionStatus.EXECUTING,
            "iteration": 0,
        }
    except Exception as exc:
        logger.exception("Error in task_planning_node: %s", exc)
        if ctx.telemetry:
            ctx.telemetry.record_node_end(
                node_name, start_t, success=False, error_category="planning_error"
            )
        return {
            "status": AgentExecutionStatus.FAILED,
            "termination_reason": AgentTerminationReason.UNEXPECTED_ERROR,
            "error": str(exc),
            "node_failures": [node_name],
        }


# -----------------------------------------------------------------------------
# Node 3: Tool Execution
# -----------------------------------------------------------------------------
async def tool_execution_node(
    state: GraphAgentState,
    config: RunnableConfig | None = None,
) -> dict[str, Any]:
    """Executes pending plan steps concurrently with validation, caching, and budget guards."""
    ctx = _get_context(config)
    start_t = ctx.clock()
    node_name = "tool_execution"

    steps = state.get("steps", [])
    pending_steps = [s for s in steps if s.status == StepStatus.PENDING]
    if not pending_steps:
        if ctx.telemetry:
            ctx.telemetry.record_node_end(node_name, start_t, success=True)
        return {"status": AgentExecutionStatus.OBSERVING}

    tool_handler = ctx.tool_handler
    if tool_handler is None:
        # If no tool handler, mark all pending steps skipped
        skipped_steps = []
        for s in pending_steps:
            s_copy = s.model_copy()
            s_copy.status = StepStatus.SKIPPED
            s_copy.error = "Tool handler unavailable"
            skipped_steps.append(s_copy)
        return {
            "steps": skipped_steps,
            "status": AgentExecutionStatus.OBSERVING,
        }

    semaphore = asyncio.Semaphore(_CONCURRENCY_LIMIT)
    current_calls = state.get("total_tool_calls", 0)
    budget = ctx.budget

    updated_steps: list[PlanStep] = []
    new_observations: list[ToolObservation] = []
    new_signatures: list[str] = []
    new_tool_results: list[DomainToolResult] = []
    new_call_count = 0

    async def _execute_single_step(
        step: PlanStep,
    ) -> tuple[PlanStep, ToolObservation | None, DomainToolResult | None, str | None, bool]:
        nonlocal current_calls, new_call_count
        tool_name = step.action.tool_name
        raw_args = dict(step.action.args)
        step_copy = step.model_copy()

        # 1. Argument Validation
        schema = TOOL_ARG_SCHEMAS.get(tool_name)
        if schema:
            try:
                validated = schema.model_validate(raw_args)
                raw_args = validated.model_dump(exclude_none=True)
            except ValidationError as err:
                sanitized = sanitize_tool_error(tool_name, err)
                obs = ctx.observer.process_tool_result(
                    step_copy.step_id, tool_name, raw_args, sanitized
                )
                step_copy.status = StepStatus.FAILED
                step_copy.error = str(sanitized.get("error"))
                step_copy.observation = obs
                return step_copy, obs, None, None, False

        # 2. Duplicate Action Prevention
        action_sig = f"{tool_name}:{json.dumps(raw_args, sort_keys=True)}"
        if action_sig in ctx.tool_cache:
            cached_result = ctx.tool_cache[action_sig]
            obs = ctx.observer.process_tool_result(
                step_copy.step_id, tool_name, raw_args, cached_result
            )
            try:
                metrics_registry.record_tool_call(
                    tool_name=tool_name,
                    duration_ms=0.0,
                    success=not obs.has_error,
                    cached=True,
                )
            except Exception:  # noqa: BLE001 - fail-open observability
                pass
            step_copy.status = StepStatus.COMPLETED
            step_copy.observation = obs
            return step_copy, obs, None, None, False

        # 3. Tool Call Budget Enforcement
        if (current_calls + new_call_count) >= budget.max_tool_calls:
            limit_msg = f"Tool execution limit of {budget.max_tool_calls} calls reached."
            err_res = {"error": limit_msg}
            obs = ctx.observer.process_tool_result(step_copy.step_id, tool_name, raw_args, err_res)
            step_copy.status = StepStatus.SKIPPED
            step_copy.error = "Max tool calls limit reached"
            step_copy.observation = obs
            return step_copy, obs, None, None, False

        # 4. Tool Execution
        step_copy.status = StepStatus.RUNNING
        new_call_count += 1

        tool_t0 = ctx.clock()
        try:
            async with semaphore:
                res = await tool_handler(tool_name, raw_args)
        except Exception as exc:
            res = sanitize_tool_error(tool_name, exc)
        tool_ms = max(0.0, (ctx.clock() - tool_t0) * 1000.0)

        ctx.tool_cache[action_sig] = res
        obs = ctx.observer.process_tool_result(step_copy.step_id, tool_name, raw_args, res)
        try:
            metrics_registry.record_tool_call(
                tool_name=tool_name,
                duration_ms=tool_ms,
                success=not obs.has_error,
                cached=False,
            )
        except Exception:  # noqa: BLE001 - fail-open observability
            pass
        step_copy.status = StepStatus.FAILED if obs.has_error else StepStatus.COMPLETED
        step_copy.observation = obs
        step_copy.error = obs.error_message
        exec_res = DomainToolResult(tool_name=tool_name, args=raw_args, result=res)
        return step_copy, obs, exec_res, action_sig, True

    try:
        batch_outcomes = await asyncio.gather(*[_execute_single_step(s) for s in pending_steps])

        for step_res, obs, tool_res, sig, _executed in batch_outcomes:
            updated_steps.append(step_res)
            if obs:
                new_observations.append(obs)
            if tool_res:
                new_tool_results.append(tool_res)
            if sig:
                new_signatures.append(sig)

        if ctx.telemetry:
            ctx.telemetry.tool_calls_count += new_call_count
            ctx.telemetry.tools_executed.extend([tr.tool_name for tr in new_tool_results])
            ctx.telemetry.record_node_end(node_name, start_t, success=True)

        return {
            "steps": updated_steps,
            "observations": new_observations,
            "executed_tools": new_signatures,
            "executed_tool_results": new_tool_results,
            "total_tool_calls": new_call_count,
            "status": AgentExecutionStatus.OBSERVING,
        }
    except Exception as exc:
        logger.exception("Error in tool_execution_node: %s", exc)
        if ctx.telemetry:
            ctx.telemetry.record_node_end(
                node_name, start_t, success=False, error_category="tool_execution_error"
            )
        return {
            "status": AgentExecutionStatus.FAILED,
            "error": str(exc),
            "node_failures": [node_name],
        }


# -----------------------------------------------------------------------------
# Node 4: Observation Processing
# -----------------------------------------------------------------------------
async def observation_processing_node(
    state: GraphAgentState,
    config: RunnableConfig | None = None,
) -> dict[str, Any]:
    """Processes observations, checks budgets/deadlines, and determines replanning needs."""
    ctx = _get_context(config)
    start_t = ctx.clock()
    node_name = "observation_processing"

    goal = state.get("goal")
    steps = state.get("steps", [])
    observations = state.get("observations", [])
    replans_count = state.get("replans_count", 0)
    total_calls = state.get("total_tool_calls", 0)
    iteration = state.get("iteration", 0)
    deadline = state.get("deadline", start_t + 15.0)

    # 1. Deadline Check
    remaining_time = deadline - ctx.clock()
    if remaining_time < (ctx.budget.deadline_margin_s + _MIN_DEADLINE_MARGIN_S):
        if ctx.telemetry:
            ctx.telemetry.record_node_end(node_name, start_t, success=True)
        return {
            "status": AgentExecutionStatus.DEADLINE_EXCEEDED,
            "termination_reason": AgentTerminationReason.DEADLINE_APPROACHING,
            "needs_replanning": False,
        }

    # 2. Iteration Check
    if iteration >= ctx.budget.max_iterations:
        if ctx.telemetry:
            ctx.telemetry.record_node_end(node_name, start_t, success=True)
        return {
            "status": AgentExecutionStatus.BUDGET_EXCEEDED,
            "termination_reason": AgentTerminationReason.MAX_ITERATIONS_REACHED,
            "needs_replanning": False,
        }

    # 3. Tool Calls Check
    if total_calls >= ctx.budget.max_tool_calls:
        if ctx.telemetry:
            ctx.telemetry.record_node_end(node_name, start_t, success=True)
        return {
            "status": AgentExecutionStatus.BUDGET_EXCEEDED,
            "termination_reason": AgentTerminationReason.MAX_TOOL_CALLS_REACHED,
            "needs_replanning": False,
        }

    if not goal:
        return {
            "status": AgentExecutionStatus.COMPLETED,
            "termination_reason": AgentTerminationReason.ALL_STEPS_COMPLETED,
            "needs_replanning": False,
        }

    try:
        eval_result = ctx.observer.evaluate_observations(
            goal=goal,
            steps=steps,
            observations=observations,
            budget=ctx.budget,
            replans_count=replans_count,
        )

        can_replan = (
            eval_result.needs_replanning
            and replans_count < ctx.budget.max_replanning_attempts
            and len(steps) < ctx.budget.max_planning_steps
        )

        if can_replan:
            status = AgentExecutionStatus.REPLANNING
            term_reason = None
        elif eval_result.goal_satisfied:
            status = AgentExecutionStatus.COMPLETED
            term_reason = AgentTerminationReason.GOAL_SATISFIED
        elif all(
            s.status in (StepStatus.COMPLETED, StepStatus.FAILED, StepStatus.SKIPPED) for s in steps
        ):
            status = AgentExecutionStatus.COMPLETED
            term_reason = AgentTerminationReason.ALL_STEPS_COMPLETED
        else:
            status = AgentExecutionStatus.EXECUTING
            term_reason = None

        if ctx.telemetry:
            ctx.telemetry.record_node_end(node_name, start_t, success=True)

        return {
            "status": status,
            "termination_reason": term_reason,
            "needs_replanning": can_replan,
            "replan_reason": eval_result.replan_reason,
            "missing_data_domains": eval_result.missing_data_domains,
            "new_steps": eval_result.new_steps if can_replan else [],
        }
    except Exception as exc:
        logger.exception("Error in observation_processing_node: %s", exc)
        if ctx.telemetry:
            ctx.telemetry.record_node_end(
                node_name, start_t, success=False, error_category="observation_eval_error"
            )
        return {
            "status": AgentExecutionStatus.FAILED,
            "error": str(exc),
            "node_failures": [node_name],
            "needs_replanning": False,
        }


# -----------------------------------------------------------------------------
# Node 5: Replanning
# -----------------------------------------------------------------------------
async def replanning_node(
    state: GraphAgentState,
    config: RunnableConfig | None = None,
) -> dict[str, Any]:
    """Appends adaptive recovery steps and increments replanning counters."""
    ctx = _get_context(config)
    start_t = ctx.clock()
    node_name = "replanning"

    existing_steps = state.get("steps", [])
    new_steps = state.get("new_steps", [])
    replans_count = state.get("replans_count", 0) + 1
    iteration = state.get("iteration", 0) + 1

    steps_to_add: list[PlanStep] = []
    current_count = len(existing_steps)
    for s in new_steps:
        if current_count < ctx.budget.max_planning_steps:
            steps_to_add.append(s)
            current_count += 1

    if ctx.telemetry:
        ctx.telemetry.replans_count = replans_count
        ctx.telemetry.record_node_end(node_name, start_t, success=True)

    return {
        "steps": steps_to_add,
        "replans_count": replans_count,
        "iteration": iteration,
        "needs_replanning": False,
        "new_steps": [],
        "status": AgentExecutionStatus.EXECUTING,
    }


# -----------------------------------------------------------------------------
# Node 6: Final Synthesis
# -----------------------------------------------------------------------------
async def final_synthesis_node(
    state: GraphAgentState,
    config: RunnableConfig | None = None,
) -> dict[str, Any]:
    """Synthesizes the final grounded CoachChatResult using verified observations."""
    ctx = _get_context(config)
    start_t = ctx.clock()
    node_name = "final_synthesis"

    observations = state.get("observations", [])
    goal = state.get("goal")
    tool_results = state.get("executed_tool_results", [])
    deadline = state.get("deadline", start_t + 10.0)
    current_status = state.get("status", AgentExecutionStatus.COMPLETED)
    current_reason = state.get("termination_reason")

    remaining_time = max(1.0, deadline - ctx.clock())

    prompt = build_agent_synthesis_prompt(
        user_message=ctx.request.message,
        context=ctx.request.context,
        observations=observations,
        history=ctx.request.history,
        memories=ctx.request.memories,
        knowledge=ctx.request.knowledge,
        goal=goal,
    )

    try:
        llm_result: LlmResult = await ctx.llm.generate_text(
            prompt,
            primary_model=ctx.request.model.primary,
            fallback_model=ctx.request.model.fallback,
            deadline_s=remaining_time,
            schema=GeminiCoachReplyOutput,
        )

        if llm_result.finish_reason == "SAFETY":
            raise LlmServiceError(
                code="PROVIDER_UNAVAILABLE",
                message="Coach reply was blocked by safety policies.",
                dispatched=True,
                usage=llm_result.usage,
            )

        # Parse structured output
        parsed_output: GeminiCoachReplyOutput | None = None
        if isinstance(llm_result.parsed, GeminiCoachReplyOutput):
            parsed_output = llm_result.parsed
        elif isinstance(llm_result.parsed, dict):
            try:
                parsed_output = GeminiCoachReplyOutput.model_validate(llm_result.parsed)
            except Exception:
                parsed_output = None
        elif llm_result.text and llm_result.text.strip():
            try:
                data = strict_json_loads(strip_code_fences(llm_result.text))
                if isinstance(data, dict):
                    parsed_output = GeminiCoachReplyOutput.model_validate(data)
            except Exception:
                parsed_output = None

        if parsed_output is None:
            resp_text = llm_result.text or "Here is your fitness coaching summary."
            coach_result = CoachChatResult(
                text=resp_text,
                follow_ups=["How can I improve further?", "Show my workout plan"],
                sources=["Profile"],
                medical_note=False,
            )
        else:
            coach_result = CoachChatResult(
                text=parsed_output.text,
                follow_ups=parsed_output.follow_ups,
                sources=parsed_output.sources,
                medical_note=parsed_output.medical_note,
            )

        # Enrich sources with tool labels
        for tr in tool_results:
            label = TOOL_SOURCE_LABELS.get(tr.tool_name)
            if label and label not in coach_result.sources:
                coach_result.sources.append(label)

        if tool_results:
            coach_result.tool_calls = [tr.tool_name for tr in tool_results]

        # Determine terminal status
        final_status: AgentExecutionStatus
        if current_status in (
            AgentExecutionStatus.BYPASSED,
            AgentExecutionStatus.DEADLINE_EXCEEDED,
            AgentExecutionStatus.BUDGET_EXCEEDED,
            AgentExecutionStatus.FAILED,
        ):
            final_status = current_status
        else:
            final_status = AgentExecutionStatus.COMPLETED

        final_reason = current_reason or (
            AgentTerminationReason.SIMPLE_QUERY_BYPASS
            if current_status == AgentExecutionStatus.BYPASSED
            else AgentTerminationReason.GOAL_SATISFIED
        )

        domain_usage = Usage(
            model=llm_result.usage.model,
            is_fallback=llm_result.usage.is_fallback,
            input_tokens=llm_result.usage.input_tokens,
            output_tokens=llm_result.usage.output_tokens,
            cached_tokens=llm_result.usage.cached_tokens,
            thinking_tokens=llm_result.usage.thinking_tokens,
            total_tokens=llm_result.usage.total_tokens,
            duration_ms=llm_result.usage.duration_ms,
        )

        if ctx.telemetry:
            ctx.telemetry.termination_reason = str(final_reason)
            ctx.telemetry.record_node_end(node_name, start_t, success=True)

        return {
            "response": coach_result,
            "usage": domain_usage,
            "status": final_status,
            "termination_reason": final_reason,
            "accumulated_tokens": llm_result.usage.total_tokens,
        }
    except Exception as exc:
        logger.exception("Error in final_synthesis_node: %s", exc)
        if ctx.telemetry:
            ctx.telemetry.record_node_end(
                node_name, start_t, success=False, error_category="synthesis_error"
            )

        # Graceful fallback synthesis with whatever partial observations exist
        fallback_text = (
            "I encountered a temporary processing issue while preparing your fitness "
            "analysis. Here is the verified data gathered so far: "
            + (
                "; ".join(obs.summary for obs in observations)
                if observations
                else "No external logs were retrieved."
            )
        )
        sources = ["Profile"] + [
            TOOL_SOURCE_LABELS.get(tr.tool_name, tr.tool_name) for tr in tool_results
        ]
        fallback_res = CoachChatResult(
            text=fallback_text,
            follow_ups=["Try again", "Show profile"],
            sources=sources,
            medical_note=False,
            tool_calls=[tr.tool_name for tr in tool_results] if tool_results else None,
        )
        return {
            "response": fallback_res,
            "status": AgentExecutionStatus.FAILED,
            "termination_reason": AgentTerminationReason.UNEXPECTED_ERROR,
            "error": str(exc),
            "node_failures": [node_name],
        }
