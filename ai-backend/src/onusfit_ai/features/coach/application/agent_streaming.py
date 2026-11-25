"""Streaming adapters for Phase 09 (native), Phase 10 (LangGraph), and Phase 13 (multi-agent).

Reuses existing planners, observers, budgets, LangGraph nodes, A2A mediator, MCP gateway,
and specialists while streaming safe progress status events and genuine LLM token deltas.
"""

from __future__ import annotations

import asyncio
import copy
import json
import logging
import time
from collections.abc import Awaitable, Callable
from functools import lru_cache
from typing import Any

from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from pydantic import ValidationError

from onusfit_ai.features.coach.application.agent.executor import (
    _CONCURRENCY_LIMIT,
    _MIN_DEADLINE_MARGIN_S,
    build_agent_synthesis_prompt,
)
from onusfit_ai.features.coach.application.agent.graph.nodes import (
    GraphRuntimeContext,
    _get_context,
    interpret_goal_node,
    observation_processing_node,
    replanning_node,
    task_planning_node,
    tool_execution_node,
)
from onusfit_ai.features.coach.application.agent.graph.routing import (
    route_after_observation,
    should_bypass,
)
from onusfit_ai.features.coach.application.agent.graph.state import (
    GraphAgentState,
    create_initial_graph_state,
)
from onusfit_ai.features.coach.application.agent.graph.telemetry import (
    GraphExecutionTelemetry,
)
from onusfit_ai.features.coach.application.agent.observer import AgentObserver
from onusfit_ai.features.coach.application.agent.planner import (
    AgentPlanner,
    detect_language,
)
from onusfit_ai.features.coach.application.multi_agent.agents import (
    BaseSpecialistAgent,
    KnowledgeAgent,
    NutritionAgent,
    ProgressAgent,
    RecoveryAgent,
    SupervisorAgent,
    WorkoutAgent,
)
from onusfit_ai.features.coach.application.multi_agent.budgets import (
    CumulativeBudgetTracker,
    MultiAgentBudgetExceededError,
)
from onusfit_ai.features.coach.application.multi_agent.context import (
    build_shared_execution_context,
)
from onusfit_ai.features.coach.application.multi_agent.graph.nodes import (
    MultiAgentRuntimeContext,
    _get_ctx,
    aggregate_results_node,
    delegate_tasks_node,
    execute_tasks_node,
    interpret_intent_node,
    replan_tasks_node,
    select_agents_node,
    validate_results_node,
)
from onusfit_ai.features.coach.application.multi_agent.graph.routing import (
    route_after_select_agents,
    route_after_validation,
)
from onusfit_ai.features.coach.application.multi_agent.graph.state import (
    MultiAgentGraphState,
    create_initial_multi_agent_state,
)
from onusfit_ai.features.coach.application.multi_agent.mcp_gateway import (
    MultiAgentMcpGateway,
)
from onusfit_ai.features.coach.application.multi_agent.router import SupervisorRouter
from onusfit_ai.features.coach.application.multi_agent.telemetry import (
    MultiAgentTelemetry,
)
from onusfit_ai.features.coach.domain.agent import (
    AgentBudgetConfig,
    AgentExecutionResult,
    AgentExecutionStatus,
    AgentState,
    AgentTerminationReason,
    PlanStep,
    StepStatus,
    ToolObservation,
)
from onusfit_ai.features.coach.domain.agent import (
    ToolExecutionResult as DomainToolResult,
)
from onusfit_ai.features.coach.domain.chat import (
    CitationReference,
    CoachChatRequest,
    CoachChatResult,
)
from onusfit_ai.features.coach.domain.multi_agent import (
    A2AMediatorProtocol,
    AgentRole,
    MultiAgentTerminationReason,
    MultiAgentWorkflowStatus,
    MultimodalMealPort,
    OrchestrationMode,
    WorkoutPlannerPort,
)
from onusfit_ai.features.coach.domain.streaming import (
    build_streaming_coach_result,
    safe_agent_progress_message,
    safe_tool_progress_message,
)
from onusfit_ai.shared.contracts.common import Usage
from onusfit_ai.shared.contracts.streaming import (
    StreamDeltaEvent,
    StreamStage,
    StreamStatusEvent,
    sanitize_stream_delta,
)
from onusfit_ai.shared.contracts.tools import TOOL_ARG_SCHEMAS, TOOL_SOURCE_LABELS
from onusfit_ai.shared.llm.ports import (
    LlmServiceError,
    LlmUsage,
    MediaInput,
    TextGenerator,
    ToolExecutionResult,
    sanitize_tool_error,
)
from onusfit_ai.shared.logging import AgentObservabilityTracker

logger = logging.getLogger("onusfit_ai.coach.agent_streaming")

StreamCallback = Callable[[StreamStatusEvent | StreamDeltaEvent], Awaitable[None]]


def _adapt_prompt_to_prose_streaming(prompt: str) -> str:
    """Convert a JSON-instructed synthesis prompt to natural prose streaming instructions."""
    adapted = prompt.replace(
        "4. Response Format: Return a VALID JSON object ONLY. Do not wrap in markdown backticks.",
        (
            "4. Streaming Response Format: Respond directly in clear, natural prose "
            "(no JSON or markdown fences)."
        ),
    )
    adapted = adapted.replace(
        "5. Return a VALID JSON object matching the standard response format.",
        "5. Respond directly in natural, encouraging conversational prose (do NOT output JSON).",
    )
    adapted = adapted.replace(
        "5. Return ONLY a valid JSON object matching the standard Coach response format.",
        "5. Respond directly in natural, encouraging conversational prose (do NOT output JSON).",
    )
    return adapted


async def _stream_llm_prose(
    *,
    llm: TextGenerator,
    prompt: str,
    primary_model: str,
    fallback_model: str | None,
    deadline_s: float,
    trace_id: str,
    emit: StreamCallback,
    seq_counter: list[int],
    media: MediaInput | list[MediaInput] | None = None,
    user_id: str | None = None,
    cancel_event: asyncio.Event | None = None,
) -> tuple[str, LlmUsage]:
    """Stream prose tokens via `generate_text_stream` when available, else `generate_text`."""
    stream_fn = getattr(llm, "generate_text_stream", None)
    accumulated: list[str] = []
    final_usage: LlmUsage | None = None
    finish_reason: str | None = None

    if callable(stream_fn):
        stream_iter = stream_fn(
            prompt,
            primary_model=primary_model,
            fallback_model=fallback_model,
            deadline_s=deadline_s,
            media=media,
            schema=None,
            user_id=user_id,
        )
        try:
            async for chunk in stream_iter:
                if cancel_event is not None and cancel_event.is_set():
                    raise asyncio.CancelledError("Stream cancelled by caller")
                delta = sanitize_stream_delta(chunk.text_delta)
                if delta:
                    accumulated.append(delta)
                    seq = seq_counter[0]
                    seq_counter[0] += 1
                    await emit(StreamDeltaEvent(delta=delta, sequence=seq, trace_id=trace_id))
                if chunk.usage is not None:
                    final_usage = chunk.usage
                if chunk.finish_reason is not None:
                    finish_reason = chunk.finish_reason
        finally:
            aclose = getattr(stream_iter, "aclose", None)
            if callable(aclose):
                try:
                    await aclose()
                except Exception:  # noqa: BLE001
                    pass

        if finish_reason == "SAFETY":
            raise LlmServiceError(
                code="PROVIDER_UNAVAILABLE",
                message="Coach reply was blocked by safety policies.",
                dispatched=True,
                usage=final_usage,
            )
        usage = final_usage or LlmUsage(
            model=primary_model,
            is_fallback=False,
            input_tokens=0,
            output_tokens=0,
            cached_tokens=0,
            thinking_tokens=0,
            total_tokens=0,
            duration_ms=0,
        )
        return "".join(accumulated), usage

    # Safe fallback for non-streaming TextGenerator test stubs
    res = await llm.generate_text(
        prompt,
        primary_model=primary_model,
        fallback_model=fallback_model,
        deadline_s=deadline_s,
        media=media,
        schema=None,
        user_id=user_id,
    )
    if res.finish_reason == "SAFETY":
        raise LlmServiceError(
            code="PROVIDER_UNAVAILABLE",
            message="Coach reply was blocked by safety policies.",
            dispatched=True,
            usage=res.usage,
        )
    safe_text = sanitize_stream_delta(res.text)
    if safe_text:
        seq = seq_counter[0]
        seq_counter[0] += 1
        await emit(StreamDeltaEvent(delta=safe_text, sequence=seq, trace_id=trace_id))
    return safe_text, res.usage


def _make_status(
    stage: StreamStage,
    message: str,
    trace_id: str,
    *,
    agent_role: str | None = None,
    tool_name: str | None = None,
    step_index: int | None = None,
    total_steps: int | None = None,
) -> StreamStatusEvent:
    return StreamStatusEvent(
        stage=stage,
        message=message[:160],
        agent_role=agent_role,
        tool_name=tool_name,
        step_index=step_index,
        total_steps=total_steps,
        trace_id=trace_id,
    )


async def stream_native_agent(
    *,
    request: CoachChatRequest,
    llm: TextGenerator,
    trace_id: str,
    user_id: str,
    tool_handler: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]] | None,
    emit: StreamCallback,
    seq_counter: list[int],
    budget: AgentBudgetConfig | None = None,
    tool_cache: dict[str, dict[str, Any]] | None = None,
    media: MediaInput | list[MediaInput] | None = None,
    cancel_event: asyncio.Event | None = None,
    clock: Callable[[], float] = time.monotonic,
) -> AgentExecutionResult:
    """Execute Phase 09 native agent loop with safe status events and streaming synthesis."""
    cfg = budget or AgentBudgetConfig()
    planner = AgentPlanner(cfg)
    observer = AgentObserver()
    start_t = clock()
    deadline = start_t + (request.deadline_ms / 1000.0)

    await emit(_make_status("routing", "Understanding your request...", trace_id))
    goal = planner.interpret_goal(request.message, request.context)

    obs_tracker = AgentObservabilityTracker(engine="native", trace_id=trace_id)
    obs_tracker.record_routing(
        intent=str(goal.goal_type.value),
        requires_agent=goal.requires_agent_execution and tool_handler is not None,
    )

    state = AgentState(
        trace_id=trace_id,
        user_id=user_id,
        goal=goal,
        plan=None,
        iteration=0,
        replans_count=0,
        steps=[],
        observations=[],
        executed_tools=[],
        status=AgentExecutionStatus.PLANNING,
        termination_reason=None,
        total_tool_calls=0,
        accumulated_tokens=0,
        start_time=start_t,
    )
    executed_tool_results: list[ToolExecutionResult] = []
    cache = dict(tool_cache) if tool_cache is not None else {}

    if goal.requires_agent_execution and tool_handler is not None:
        plan = planner.create_plan(goal, request.message, request.context)
        state.plan = plan
        state.steps = list(plan.steps)
        state.status = AgentExecutionStatus.EXECUTING
        semaphore = asyncio.Semaphore(_CONCURRENCY_LIMIT)

        while state.status == AgentExecutionStatus.EXECUTING:
            if cancel_event is not None and cancel_event.is_set():
                raise asyncio.CancelledError("Agent stream cancelled")
            if (deadline - clock()) < (cfg.deadline_margin_s + _MIN_DEADLINE_MARGIN_S):
                state.status = AgentExecutionStatus.DEADLINE_EXCEEDED
                state.termination_reason = AgentTerminationReason.DEADLINE_APPROACHING
                obs_tracker.record_limit_hit("deadline")
                break
            if state.iteration >= cfg.max_iterations:
                state.status = AgentExecutionStatus.BUDGET_EXCEEDED
                state.termination_reason = AgentTerminationReason.MAX_ITERATIONS_REACHED
                obs_tracker.record_limit_hit("max_iterations")
                break
            if state.total_tool_calls >= cfg.max_tool_calls:
                state.status = AgentExecutionStatus.BUDGET_EXCEEDED
                state.termination_reason = AgentTerminationReason.MAX_TOOL_CALLS_REACHED
                obs_tracker.record_limit_hit("max_tool_calls")
                break

            pending = [s for s in state.steps if s.status == StepStatus.PENDING]
            if not pending:
                state.status = AgentExecutionStatus.COMPLETED
                state.termination_reason = AgentTerminationReason.ALL_STEPS_COMPLETED
                break

            async def _run_step(
                step: PlanStep,
            ) -> tuple[PlanStep, ToolObservation, ToolExecutionResult | None]:
                tool_name = step.action.tool_name
                raw_args = dict(step.action.args)
                schema = TOOL_ARG_SCHEMAS.get(tool_name)
                if schema:
                    try:
                        raw_args = schema.model_validate(raw_args).model_dump(exclude_none=True)
                    except ValidationError as err:
                        sanitized = sanitize_tool_error(tool_name, err)
                        obs = observer.process_tool_result(
                            step.step_id, tool_name, raw_args, sanitized
                        )
                        step.status = StepStatus.FAILED
                        step.error = str(sanitized.get("error"))
                        step.observation = obs
                        return step, obs, None

                sig = f"{tool_name}:{json.dumps(raw_args, sort_keys=True)}"
                if sig in cache:
                    obs = observer.process_tool_result(
                        step.step_id, tool_name, raw_args, cache[sig]
                    )
                    step.status = StepStatus.COMPLETED
                    step.observation = obs
                    return step, obs, None

                if state.total_tool_calls >= cfg.max_tool_calls:
                    obs = observer.process_tool_result(
                        step.step_id,
                        tool_name,
                        raw_args,
                        {"error": f"Tool limit of {cfg.max_tool_calls} exceeded."},
                    )
                    step.status = StepStatus.SKIPPED
                    step.observation = obs
                    return step, obs, None

                await emit(
                    _make_status(
                        "tool_calling",
                        safe_tool_progress_message(tool_name),
                        trace_id,
                        tool_name=tool_name,
                    )
                )
                step.status = StepStatus.RUNNING
                state.total_tool_calls += 1
                state.executed_tools.append(sig)
                t0 = clock()
                try:
                    async with semaphore:
                        res = await tool_handler(tool_name, raw_args)
                except Exception as exc:  # noqa: BLE001
                    res = sanitize_tool_error(tool_name, exc)
                cache[sig] = res
                obs = observer.process_tool_result(step.step_id, tool_name, raw_args, res)
                obs_tracker.record_tool_call(
                    tool_name=tool_name,
                    duration_ms=max(0.0, (clock() - t0) * 1000.0),
                    success=not obs.has_error,
                    cached=False,
                )
                step.status = StepStatus.FAILED if obs.has_error else StepStatus.COMPLETED
                step.observation = obs
                step.error = obs.error_message
                return (
                    step,
                    obs,
                    ToolExecutionResult(tool_name=tool_name, args=raw_args, result=res),
                )

            for _s, obs, exec_res in await asyncio.gather(*[_run_step(s) for s in pending]):
                state.observations.append(obs)
                if exec_res is not None:
                    executed_tool_results.append(exec_res)

            evaluation = observer.evaluate_observations(
                goal=goal,
                steps=state.steps,
                observations=state.observations,
                budget=cfg,
                replans_count=state.replans_count,
            )
            if evaluation.needs_replanning and state.replans_count < cfg.max_replanning_attempts:
                state.replans_count += 1
                for ns in evaluation.new_steps:
                    if len(state.steps) < cfg.max_planning_steps:
                        state.steps.append(ns)
                state.status = AgentExecutionStatus.EXECUTING
            elif evaluation.goal_satisfied or all(
                s.status in (StepStatus.COMPLETED, StepStatus.FAILED, StepStatus.SKIPPED)
                for s in state.steps
            ):
                state.status = AgentExecutionStatus.COMPLETED
                state.termination_reason = (
                    AgentTerminationReason.GOAL_SATISFIED
                    if evaluation.goal_satisfied
                    else AgentTerminationReason.ALL_STEPS_COMPLETED
                )
                break
            state.iteration += 1
    else:
        state.status = AgentExecutionStatus.BYPASSED
        state.termination_reason = AgentTerminationReason.SIMPLE_QUERY_BYPASS

    obs_tracker.iterations = state.iteration
    obs_tracker.replans = state.replans_count
    obs_tracker.finalize(outcome=str(state.status.value))

    await emit(_make_status("synthesizing", "Preparing your personalized reply...", trace_id))
    prompt = _adapt_prompt_to_prose_streaming(
        build_agent_synthesis_prompt(
            user_message=request.message,
            context=request.context,
            observations=state.observations,
            history=request.history,
            memories=request.memories,
            knowledge=request.knowledge,
            goal=goal,
        )
    )
    remaining_s = max(1.0, deadline - clock())
    streamed_text, llm_usage = await _stream_llm_prose(
        llm=llm,
        prompt=prompt,
        primary_model=request.model.primary,
        fallback_model=request.model.fallback,
        deadline_s=remaining_s,
        trace_id=trace_id,
        emit=emit,
        seq_counter=seq_counter,
        media=media,
        user_id=user_id,
        cancel_event=cancel_event,
    )

    tool_names = [tr.tool_name for tr in executed_tool_results]
    sources = ["Profile", "Today's Nutrition"]
    for tn in tool_names:
        lbl = TOOL_SOURCE_LABELS.get(tn)
        if lbl and lbl not in sources:
            sources.append(lbl)
    citations = (
        [
            CitationReference(
                document_slug=k.document_slug,
                document_title=k.document_title,
                category=k.category,
                chunk_index=k.chunk_index,
                citation=k.citation,
            )
            for k in request.knowledge
        ]
        if request.knowledge
        else None
    )
    coach_result = build_streaming_coach_result(
        streamed_text=streamed_text,
        request=request,
        tool_calls=tool_names,
        sources=sources,
        citations=citations,
    )
    return AgentExecutionResult(
        response=coach_result,
        status=state.status,
        termination_reason=state.termination_reason or AgentTerminationReason.GOAL_SATISFIED,
        goal=goal,
        executed_steps=state.steps,
        observations=state.observations,
        tool_calls=[
            DomainToolResult(tool_name=tr.tool_name, args=tr.args, result=tr.result)
            for tr in executed_tool_results
        ],
        usage=Usage(
            model=llm_usage.model,
            is_fallback=llm_usage.is_fallback,
            input_tokens=llm_usage.input_tokens,
            output_tokens=llm_usage.output_tokens,
            cached_tokens=llm_usage.cached_tokens,
            thinking_tokens=llm_usage.thinking_tokens,
            total_tokens=llm_usage.total_tokens,
            duration_ms=llm_usage.duration_ms,
        ),
        iterations=state.iteration,
        replans=state.replans_count,
    )


async def _streaming_langgraph_synthesis_node(
    state: GraphAgentState,
    config: RunnableConfig,
) -> dict[str, Any]:
    """LangGraph terminal node that streams synthesis prose incrementally."""
    ctx = _get_context(config)
    configurable = config.get("configurable", {})
    emit: StreamCallback = configurable["stream_emit"]
    seq_counter: list[int] = configurable["stream_seq"]
    cancel_event: asyncio.Event | None = configurable.get("cancel_event")
    media: MediaInput | list[MediaInput] | None = configurable.get("stream_media")
    start_t = ctx.clock()

    observations = state.get("observations", [])
    goal = state.get("goal")
    tool_results = state.get("executed_tool_results", [])
    deadline = state.get("deadline", start_t + 10.0)
    remaining_time = max(1.0, deadline - ctx.clock())

    await emit(
        _make_status("synthesizing", "Preparing your personalized reply...", state["trace_id"])
    )

    prompt = _adapt_prompt_to_prose_streaming(
        build_agent_synthesis_prompt(
            user_message=ctx.request.message,
            context=ctx.request.context,
            observations=observations,
            history=ctx.request.history,
            memories=ctx.request.memories,
            knowledge=ctx.request.knowledge,
            goal=goal,
        )
    )
    streamed_text, llm_usage = await _stream_llm_prose(
        llm=ctx.llm,
        prompt=prompt,
        primary_model=ctx.request.model.primary,
        fallback_model=ctx.request.model.fallback,
        deadline_s=remaining_time,
        trace_id=state["trace_id"],
        emit=emit,
        seq_counter=seq_counter,
        media=media,
        user_id=state.get("user_id"),
        cancel_event=cancel_event,
    )
    tool_names = [tr.tool_name for tr in tool_results]
    sources = ["Profile", "Today's Nutrition"]
    for tn in tool_names:
        lbl = TOOL_SOURCE_LABELS.get(tn)
        if lbl and lbl not in sources:
            sources.append(lbl)
    citations = (
        [
            CitationReference(
                document_slug=k.document_slug,
                document_title=k.document_title,
                category=k.category,
                chunk_index=k.chunk_index,
                citation=k.citation,
            )
            for k in ctx.request.knowledge
        ]
        if ctx.request.knowledge
        else None
    )
    coach_result = build_streaming_coach_result(
        streamed_text=streamed_text,
        request=ctx.request,
        tool_calls=tool_names,
        sources=sources,
        citations=citations,
    )
    if ctx.telemetry:
        ctx.telemetry.record_node_end("final_synthesis", start_t, success=True)
    return {
        "response": coach_result,
        "usage": Usage(
            model=llm_usage.model,
            is_fallback=llm_usage.is_fallback,
            input_tokens=llm_usage.input_tokens,
            output_tokens=llm_usage.output_tokens,
            cached_tokens=llm_usage.cached_tokens,
            thinking_tokens=llm_usage.thinking_tokens,
            total_tokens=llm_usage.total_tokens,
            duration_ms=llm_usage.duration_ms,
        ),
        "status": AgentExecutionStatus.COMPLETED,
        "termination_reason": state.get("termination_reason")
        or AgentTerminationReason.GOAL_SATISFIED,
        "accumulated_tokens": llm_usage.total_tokens,
    }


@lru_cache(maxsize=1)
def _get_streaming_coach_graph() -> Any:
    graph = StateGraph(GraphAgentState)
    graph.add_node("interpret_goal", interpret_goal_node)
    graph.add_node("task_planning", task_planning_node)
    graph.add_node("tool_execution", tool_execution_node)
    graph.add_node("observation_processing", observation_processing_node)
    graph.add_node("replanning", replanning_node)
    graph.add_node("final_synthesis", _streaming_langgraph_synthesis_node)

    graph.add_edge(START, "interpret_goal")
    graph.add_conditional_edges(
        "interpret_goal",
        should_bypass,
        {"task_planning": "task_planning", "final_synthesis": "final_synthesis"},
    )
    graph.add_edge("task_planning", "tool_execution")
    graph.add_edge("tool_execution", "observation_processing")
    graph.add_conditional_edges(
        "observation_processing",
        route_after_observation,
        {"replanning": "replanning", "final_synthesis": "final_synthesis"},
    )
    graph.add_edge("replanning", "tool_execution")
    graph.add_edge("final_synthesis", END)
    return graph.compile()


async def stream_langgraph_agent(
    *,
    request: CoachChatRequest,
    llm: TextGenerator,
    trace_id: str,
    user_id: str,
    tool_handler: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]] | None,
    emit: StreamCallback,
    seq_counter: list[int],
    media: MediaInput | list[MediaInput] | None = None,
    cancel_event: asyncio.Event | None = None,
    enable_fallback: bool = True,
    clock: Callable[[], float] = time.monotonic,
) -> AgentExecutionResult:
    """Execute Phase 10 LangGraph workflow using `astream` + genuine streaming synthesis."""
    start_t = clock()
    deadline = start_t + (request.deadline_ms / 1000.0)
    budget = AgentBudgetConfig()
    planner = AgentPlanner(budget)
    observer = AgentObserver()
    telemetry = GraphExecutionTelemetry(
        trace_id=trace_id, user_id=user_id, start_time=start_t, engine="langgraph"
    )
    tool_cache: dict[str, dict[str, Any]] = {}
    initial_state = create_initial_graph_state(
        request, trace_id=trace_id, user_id=user_id, start_time=start_t, deadline=deadline
    )
    runtime_ctx = GraphRuntimeContext(
        planner=planner,
        observer=observer,
        budget=budget,
        llm=llm,
        request=request,
        tool_handler=tool_handler,
        clock=clock,
        telemetry=telemetry,
        tool_cache=tool_cache,
    )
    runnable_config = RunnableConfig(
        configurable={
            "graph_context": runtime_ctx,
            "thread_id": trace_id,
            "stream_emit": emit,
            "stream_seq": seq_counter,
            "cancel_event": cancel_event,
            "stream_media": media,
        }
    )

    try:
        graph = _get_streaming_coach_graph()
        merged_state: dict[str, Any] = dict(initial_state)
        async for update in graph.astream(
            initial_state, config=runnable_config, stream_mode="updates"
        ):
            if cancel_event is not None and cancel_event.is_set():
                raise asyncio.CancelledError("LangGraph stream cancelled")
            if not isinstance(update, dict):
                continue
            for node_name, node_out in update.items():
                if isinstance(node_out, dict):
                    merged_state.update(node_out)
                if node_name == "interpret_goal":
                    await emit(_make_status("routing", "Understanding your request...", trace_id))
                elif node_name == "task_planning":
                    await emit(_make_status("thinking", "Planning fitness checks...", trace_id))
                elif node_name == "tool_execution":
                    tools_ran = (
                        [tr.tool_name for tr in node_out.get("executed_tool_results", [])]
                        if isinstance(node_out, dict)
                        else []
                    )
                    if tools_ran:
                        await emit(
                            _make_status(
                                "tool_calling",
                                safe_tool_progress_message(tools_ran[-1]),
                                trace_id,
                                tool_name=tools_ran[-1],
                            )
                        )
                elif node_name == "replanning":
                    await emit(_make_status("thinking", "Gathering extra context...", trace_id))

        telemetry.termination_reason = str(
            merged_state.get("termination_reason") or "goal_satisfied"
        )
        telemetry.log_completion()

        return AgentExecutionResult(
            response=merged_state["response"],
            status=merged_state.get("status", AgentExecutionStatus.COMPLETED),
            termination_reason=merged_state.get(
                "termination_reason", AgentTerminationReason.GOAL_SATISFIED
            ),
            goal=merged_state.get("goal")
            or planner.interpret_goal(request.message, request.context),
            executed_steps=list(merged_state.get("steps", [])),
            observations=list(merged_state.get("observations", [])),
            tool_calls=[
                DomainToolResult(tool_name=tr.tool_name, args=tr.args, result=tr.result)
                for tr in merged_state.get("executed_tool_results", [])
            ],
            usage=merged_state.get("usage"),
            iterations=int(merged_state.get("iteration", 0)),
            replans=int(merged_state.get("replans_count", 0)),
        )
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001
        if seq_counter[0] > 0 or not enable_fallback or isinstance(exc, LlmServiceError):
            raise
        logger.warning(
            "LangGraph stream error (%s); falling back to native agent",
            type(exc).__name__,
        )
        telemetry.outcome = "error"
        telemetry.fallback_used = True
        telemetry.log_completion()
        return await stream_native_agent(
            request=request,
            llm=llm,
            trace_id=trace_id,
            user_id=user_id,
            tool_handler=tool_handler,
            emit=emit,
            seq_counter=seq_counter,
            budget=budget,
            tool_cache=tool_cache,
            media=media,
            cancel_event=cancel_event,
            clock=clock,
        )


async def _streaming_multi_agent_synthesis_node(
    state: MultiAgentGraphState,
    config: RunnableConfig,
) -> dict[str, Any]:
    """Multi-agent terminal node streaming Supervisor synthesis prose incrementally."""
    ctx = _get_ctx(config)
    emit: StreamCallback = config["configurable"]["stream_emit"]
    seq_counter: list[int] = config["configurable"]["stream_seq"]
    cancel_event: asyncio.Event | None = config["configurable"].get("cancel_event")

    shared = state["shared_context"]
    recs = list(state.get("recommendations", []))
    evidence = list(state.get("evidence", []))
    conflicts = list(state.get("conflicts_resolved", []))
    executed_tools = list(state.get("executed_tools", []))
    has_medical = bool(state.get("medical_halted") or shared.medical_red_flags) or any(
        r.requires_medical_caution for r in recs
    )

    if ctx.budget.is_cancelled or ctx.a2a_mediator.is_cancelled(state["trace_id"]):
        raise asyncio.CancelledError("Multi-agent stream cancelled")

    await emit(
        _make_status("synthesizing", "Synthesizing specialist guidance...", state["trace_id"])
    )

    already_analyzed_mm = any(e.source_tool == "multimodal_meal_analyzer" for e in evidence)
    synth_media: MediaInput | list[MediaInput] | None = None
    if ctx.media and not already_analyzed_mm:
        synth_media = ctx.media[0] if len(ctx.media) == 1 else ctx.media

    try:
        await ctx.budget.reserve_llm_call()
        prompt = _adapt_prompt_to_prose_streaming(
            ctx.supervisor.build_synthesis_prompt(
                request=ctx.request,
                shared_ctx=shared,
                recommendations=recs,
                evidence=evidence,
                conflicts=conflicts,
            )
        )
        remaining = max(1.0, ctx.budget.remaining_seconds())
        streamed_text, llm_res_usage = await _stream_llm_prose(
            llm=ctx.llm,
            prompt=prompt,
            primary_model=ctx.request.model.primary,
            fallback_model=ctx.request.model.fallback,
            deadline_s=remaining,
            trace_id=state["trace_id"],
            emit=emit,
            seq_counter=seq_counter,
            media=synth_media,
            user_id=shared.user_id,
            cancel_event=cancel_event,
        )
        await ctx.budget.record_tokens(
            input_tokens=llm_res_usage.input_tokens,
            output_tokens=llm_res_usage.output_tokens,
            total=llm_res_usage.total_tokens,
        )
        sources = ["Profile", "Today's Nutrition"]
        for tname in executed_tools:
            lbl = TOOL_SOURCE_LABELS.get(tname)
            if lbl and lbl not in sources:
                sources.append(lbl)
        citations = (
            [
                CitationReference(
                    document_slug=k.document_slug,
                    document_title=k.document_title,
                    category=k.category,
                    chunk_index=k.chunk_index,
                    citation=k.citation,
                )
                for k in ctx.request.knowledge
            ]
            if ctx.request.knowledge
            else None
        )
        coach_res = build_streaming_coach_result(
            streamed_text=streamed_text,
            request=ctx.request,
            tool_calls=executed_tools,
            sources=sources,
            medical_note=has_medical,
            citations=citations,
        )
        status = (
            MultiAgentWorkflowStatus.PARTIAL
            if state.get("partial_results")
            else MultiAgentWorkflowStatus.COMPLETED
        )
        term_reason = (
            MultiAgentTerminationReason.MEDICAL_RED_FLAG_HALT
            if state.get("medical_halted")
            else (state.get("termination_reason") or MultiAgentTerminationReason.GOAL_SATISFIED)
        )
        model_used = llm_res_usage.model
        is_fallback_model = llm_res_usage.is_fallback
        cached_tok = llm_res_usage.cached_tokens
        thinking_tok = llm_res_usage.thinking_tokens
    except (MultiAgentBudgetExceededError, LlmServiceError) as exc:
        if seq_counter[0] > 0:
            raise
        if isinstance(exc, LlmServiceError) and exc.code in (
            "PROVIDER_RATE_LIMITED",
            "PROVIDER_QUOTA_EXHAUSTED",
            "PROVIDER_AUTH_ERROR",
            "PROVIDER_NOT_CONFIGURED",
        ):
            raise
        coach_res = ctx.supervisor._deterministic_fallback_result(
            shared_ctx=shared,
            recommendations=recs,
            evidence=evidence,
            executed_tools=executed_tools,
            has_medical=has_medical,
        )
        seq = seq_counter[0]
        seq_counter[0] += 1
        await emit(StreamDeltaEvent(delta=coach_res.text, sequence=seq, trace_id=state["trace_id"]))
        status = MultiAgentWorkflowStatus.PARTIAL
        term_reason = MultiAgentTerminationReason.PARTIAL_RESULTS_RETURNED
        model_used = ctx.request.model.primary
        is_fallback_model = False
        cached_tok = 0
        thinking_tok = 0

    snap = ctx.budget.snapshot()
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
    ctx.telemetry.termination_reason = term_reason.value
    return {
        "response": coach_res,
        "usage": usage,
        "status": status,
        "termination_reason": term_reason,
    }


@lru_cache(maxsize=1)
def _get_streaming_multi_agent_graph() -> Any:
    graph = StateGraph(MultiAgentGraphState)
    graph.add_node("interpret_intent", interpret_intent_node)
    graph.add_node("select_agents", select_agents_node)
    graph.add_node("delegate_tasks", delegate_tasks_node)
    graph.add_node("execute_agents", execute_tasks_node)
    graph.add_node("aggregate_results", aggregate_results_node)
    graph.add_node("validate_results", validate_results_node)
    graph.add_node("replan_tasks", replan_tasks_node)
    graph.add_node("final_synthesis", _streaming_multi_agent_synthesis_node)

    graph.add_edge(START, "interpret_intent")
    graph.add_edge("interpret_intent", "select_agents")
    graph.add_conditional_edges(
        "select_agents",
        route_after_select_agents,
        {"delegate_tasks": "delegate_tasks", "final_synthesis": "final_synthesis"},
    )
    graph.add_edge("delegate_tasks", "execute_agents")
    graph.add_edge("execute_agents", "aggregate_results")
    graph.add_edge("aggregate_results", "validate_results")
    graph.add_conditional_edges(
        "validate_results",
        route_after_validation,
        {"replan_tasks": "replan_tasks", "final_synthesis": "final_synthesis"},
    )
    graph.add_edge("replan_tasks", "delegate_tasks")
    graph.add_edge("final_synthesis", END)
    return graph.compile()


async def stream_multi_agent(
    *,
    request: CoachChatRequest,
    llm: TextGenerator,
    trace_id: str,
    user_id: str,
    tool_handler: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]] | None,
    a2a_mediator: A2AMediatorProtocol,
    emit: StreamCallback,
    seq_counter: list[int],
    mcp_handler: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]] | None = None,
    discovered_tools: list[str] | None = None,
    workout_planner: WorkoutPlannerPort | None = None,
    multimodal_port: MultimodalMealPort | None = None,
    validated_media: list[MediaInput] | None = None,
    cancel_event: asyncio.Event | None = None,
    clock: Callable[[], float] = time.monotonic,
) -> tuple[CoachChatResult, Usage, bool]:
    """Execute Phase 13 multi-agent workflow via LangGraph `astream` + streaming Supervisor."""
    from onusfit_ai.features.coach.domain.multi_agent import MultiAgentExecutionBudget

    budget_cfg = MultiAgentExecutionBudget()
    start = clock()
    deadline_s = min(budget_cfg.deadline_seconds, request.deadline_ms / 1000.0)
    deadline = start + max(1.0, deadline_s)
    tracker = CumulativeBudgetTracker(
        budget=budget_cfg, clock=clock, start_time=start, deadline=deadline
    )
    gateway = MultiAgentMcpGateway(
        budget_tracker=tracker,
        mcp_handler=mcp_handler,
        native_handler=tool_handler,
        discovered_tools=discovered_tools,
        allow_mutations=False,
        durable_node_approval_verified=False,
    )
    telemetry = MultiAgentTelemetry(trace_id=trace_id, start_time=start)
    shared_ctx = build_shared_execution_context(
        request,
        trace_id=trace_id,
        user_id=user_id,
        language=detect_language(request.message),
        memory_consent_granted=bool(request.memories),
    )
    specialists: dict[AgentRole, BaseSpecialistAgent] = {
        AgentRole.WORKOUT: WorkoutAgent(
            gateway=gateway, budget=tracker, workout_planner=workout_planner
        ),
        AgentRole.NUTRITION: NutritionAgent(
            gateway=gateway,
            budget=tracker,
            multimodal_port=multimodal_port,
            request=request,
            llm=llm,
        ),
        AgentRole.PROGRESS: ProgressAgent(gateway=gateway, budget=tracker),
        AgentRole.RECOVERY: RecoveryAgent(gateway=gateway, budget=tracker),
        AgentRole.KNOWLEDGE: KnowledgeAgent(gateway=gateway, budget=tracker),
    }
    runtime_ctx = MultiAgentRuntimeContext(
        request=request,
        llm=llm,
        router=SupervisorRouter(),
        supervisor=SupervisorAgent(),
        specialists=specialists,
        a2a_mediator=a2a_mediator,
        gateway=gateway,
        budget=tracker,
        telemetry=telemetry,
        available_agents=set(specialists.keys()),
        clock=clock,
        media=validated_media or None,
    )
    initial_state = create_initial_multi_agent_state(
        shared_context=shared_ctx, max_replanning_attempts=budget_cfg.max_replanning_attempts
    )
    max_graph_steps = max(12, 8 + budget_cfg.max_replanning_attempts * 5)
    config = RunnableConfig(
        recursion_limit=max_graph_steps,
        configurable={
            "multi_agent_ctx": runtime_ctx,
            "thread_id": trace_id,
            "stream_emit": emit,
            "stream_seq": seq_counter,
            "cancel_event": cancel_event,
        },
    )

    cancel_watcher: asyncio.Task[None] | None = None
    if cancel_event is not None:

        async def _watch_cancel() -> None:
            await cancel_event.wait()
            tracker.cancel("caller_cancelled")
            a2a_mediator.cancel_conversation(trace_id, "caller_cancelled")

        cancel_watcher = asyncio.create_task(_watch_cancel())

    try:
        graph = _get_streaming_multi_agent_graph()
        merged_state: dict[str, Any] = dict(initial_state)
        async for update in graph.astream(initial_state, config=config, stream_mode="updates"):
            if cancel_event is not None and cancel_event.is_set():
                raise asyncio.CancelledError("Multi-agent stream cancelled")
            if not isinstance(update, dict):
                continue
            for node_name, node_out in update.items():
                if isinstance(node_out, dict):
                    merged_state.update(node_out)
                if node_name == "interpret_intent":
                    await emit(
                        _make_status("routing", "Reviewing your fitness inquiry...", trace_id)
                    )
                elif node_name == "select_agents" and isinstance(node_out, dict):
                    decision = node_out.get("routing_decision")
                    if decision and decision.mode != OrchestrationMode.BYPASS:
                        first_role = (
                            decision.selected_agents[0].value
                            if decision.selected_agents
                            else "supervisor"
                        )
                        await emit(
                            _make_status(
                                "agent_working",
                                safe_agent_progress_message(first_role),
                                trace_id,
                                agent_role=first_role,
                                total_steps=len(decision.selected_agents),
                            )
                        )
                elif node_name == "execute_agents" and isinstance(node_out, dict):
                    results = node_out.get("agent_results", [])
                    for idx, item in enumerate(results, start=1):
                        role_str = item.agent_role.value
                        await emit(
                            _make_status(
                                "agent_working",
                                safe_agent_progress_message(role_str),
                                trace_id,
                                agent_role=role_str,
                                step_index=idx,
                                total_steps=len(results),
                            )
                        )
                elif node_name == "aggregate_results":
                    await emit(
                        _make_status("thinking", "Combining specialist insights...", trace_id)
                    )
                elif node_name == "replan_tasks":
                    await emit(
                        _make_status("thinking", "Gathering additional context...", trace_id)
                    )

        telemetry.log_workflow_completed()
        usage: Usage = merged_state.get("usage") or Usage(
            model=request.model.primary,
            is_fallback=False,
            input_tokens=0,
            output_tokens=0,
            cached_tokens=0,
            thinking_tokens=0,
            total_tokens=0,
            duration_ms=round(max(0.0, (clock() - start) * 1000.0)),
        )
        partial = bool(
            merged_state.get("partial_results")
            or merged_state.get("status") == MultiAgentWorkflowStatus.PARTIAL
        )
        return merged_state["response"], usage, partial
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001
        if seq_counter[0] > 0 or isinstance(exc, LlmServiceError):
            raise
        logger.warning(
            "Multi-agent stream failed (%s); falling back to LangGraph/native stream",
            type(exc).__name__,
        )
        cached_sigs = gateway.export_cache_signatures()
        base_handler = tool_handler or mcp_handler

        async def _cached_fb(tool_name: str, args: dict[str, Any]) -> dict[str, Any]:
            sig = f"{tool_name}:{json.dumps(args, sort_keys=True, separators=(',', ':'))}"
            if sig in cached_sigs:
                return copy.deepcopy(cached_sigs[sig])
            if base_handler is not None:
                return await base_handler(tool_name, args)
            return {"error": f"Tool '{tool_name}' unavailable"}

        fb_res = await stream_langgraph_agent(
            request=request,
            llm=llm,
            trace_id=trace_id,
            user_id=user_id,
            tool_handler=_cached_fb if (base_handler or cached_sigs) else None,
            emit=emit,
            seq_counter=seq_counter,
            media=validated_media or None,
            cancel_event=cancel_event,
            clock=clock,
        )
        fb_usage = fb_res.usage or Usage(
            model=request.model.primary,
            is_fallback=False,
            input_tokens=0,
            output_tokens=0,
            cached_tokens=0,
            thinking_tokens=0,
            total_tokens=0,
            duration_ms=round(max(0.0, (clock() - start) * 1000.0)),
        )
        return fb_res.response, fb_usage, False
    finally:
        if cancel_watcher is not None and not cancel_watcher.done():
            cancel_watcher.cancel()
