"""LangGraph execution engine for FitOnus AI Coach Agent.

FitOnus Phase 10: LangGraph Agent Workflows — Stage 05 & 06.
Orchestrates the compiled StateGraph workflow with:
- Zero-leak request state isolation.
- Cumulative execution budget & deadline enforcement.
- Duplicate action signature caching.
- Dynamic fallback to native AgentExecutor upon graph failure.
- Strict wire contract compatibility (Node.js <-> Python).
"""

import logging
import os
import time
from collections.abc import Awaitable, Callable
from typing import Any

from langchain_core.runnables import RunnableConfig

from onusfit_ai.features.coach.application.agent.executor import AgentExecutor
from onusfit_ai.features.coach.application.agent.graph.builder import (
    get_compiled_coach_graph,
)
from onusfit_ai.features.coach.application.agent.graph.nodes import GraphRuntimeContext
from onusfit_ai.features.coach.application.agent.graph.state import (
    create_initial_graph_state,
)
from onusfit_ai.features.coach.application.agent.graph.telemetry import (
    GraphExecutionTelemetry,
)
from onusfit_ai.features.coach.application.agent.observer import AgentObserver
from onusfit_ai.features.coach.application.agent.planner import AgentPlanner
from onusfit_ai.features.coach.domain.agent import (
    AgentBudgetConfig,
    AgentExecutionResult,
    AgentExecutionStatus,
    AgentGoal,
    AgentState,
    AgentTerminationReason,
)
from onusfit_ai.features.coach.domain.agent import (
    ToolExecutionResult as DomainToolResult,
)
from onusfit_ai.features.coach.domain.chat import (
    CoachChatRequest,
    CoachChatResult,
)
from onusfit_ai.shared.contracts.common import Usage
from onusfit_ai.shared.llm.ports import TextGenerator

logger = logging.getLogger("onusfit_ai.agent.graph.executor")


def get_configured_agent_engine() -> str:
    """Returns the configured agent engine: 'langgraph' (default) or 'native'."""
    raw = os.environ.get("COACH_AGENT_ENGINE", "langgraph").strip().lower()
    return "native" if raw == "native" else "langgraph"


def is_graph_fallback_enabled() -> bool:
    """Returns whether fallback to the native agent is enabled on graph failure."""
    raw = os.environ.get("COACH_AGENT_GRAPH_FALLBACK", "true").strip().lower()
    return raw not in ("0", "false", "no", "off")


class LangGraphAgentExecutor:
    """Executes the Coach AI Agent using compiled LangGraph StateGraph workflows."""

    def __init__(
        self,
        planner: AgentPlanner | None = None,
        observer: AgentObserver | None = None,
        budget: AgentBudgetConfig | None = None,
        clock: Callable[[], float] = time.monotonic,
        graph: Any | None = None,
        fallback_executor: AgentExecutor | None = None,
        enable_fallback: bool | None = None,
    ) -> None:
        self._budget = budget or AgentBudgetConfig()
        self._planner = planner or AgentPlanner(self._budget)
        self._observer = observer or AgentObserver()
        self._clock = clock
        self._graph = graph
        self._fallback_executor = fallback_executor or AgentExecutor(
            planner=self._planner,
            observer=self._observer,
            budget=self._budget,
            clock=self._clock,
        )
        self._enable_fallback = (
            enable_fallback if enable_fallback is not None else is_graph_fallback_enabled()
        )

    def _get_graph(self) -> Any:
        """Retrieves or lazily builds the compiled graph."""
        if self._graph is None:
            self._graph = get_compiled_coach_graph()
        return self._graph

    async def execute(
        self,
        request: CoachChatRequest,
        llm: TextGenerator,
        *,
        trace_id: str,
        user_id: str,
        tool_handler: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]] | None = None,
    ) -> AgentExecutionResult:
        """Executes the LangGraph agent workflow with automatic fallback to native engine."""
        engine = get_configured_agent_engine()

        # If configured for native engine, dispatch directly to native executor
        if engine == "native":
            logger.info("Executing via native AgentExecutor (COACH_AGENT_ENGINE=native)")
            return await self._fallback_executor.execute(
                request=request,
                llm=llm,
                trace_id=trace_id,
                user_id=user_id,
                tool_handler=tool_handler,
            )

        start_time = self._clock()
        deadline = start_time + (request.deadline_ms / 1000.0)

        telemetry = GraphExecutionTelemetry(
            trace_id=trace_id,
            user_id=user_id,
            start_time=start_time,
            engine="langgraph",
        )

        tool_cache: dict[str, dict[str, Any]] = {}
        initial_state = create_initial_graph_state(
            request,
            trace_id=trace_id,
            user_id=user_id,
            start_time=start_time,
            deadline=deadline,
        )

        runtime_ctx = GraphRuntimeContext(
            planner=self._planner,
            observer=self._observer,
            budget=self._budget,
            llm=llm,
            request=request,
            tool_handler=tool_handler,
            clock=self._clock,
            telemetry=telemetry,
            tool_cache=tool_cache,
        )

        runnable_config = RunnableConfig(
            configurable={"graph_context": runtime_ctx, "thread_id": trace_id}
        )

        try:
            graph = self._get_graph()
            final_state = await graph.ainvoke(initial_state, config=runnable_config)

            telemetry.termination_reason = (
                str(final_state.get("termination_reason"))
                if final_state.get("termination_reason")
                else "unknown"
            )
            telemetry.log_completion()

            # Ensure response object is populated
            response = final_state.get("response") or CoachChatResult(
                text="Here is your fitness coaching summary.",
                follow_ups=["Show my workouts", "Improve routine"],
                sources=["Profile"],
                medical_note=False,
            )

            status = final_state.get("status", AgentExecutionStatus.COMPLETED)
            termination_reason = final_state.get(
                "termination_reason", AgentTerminationReason.GOAL_SATISFIED
            )
            goal = final_state.get("goal") or AgentGoal(
                goal_type="simple_qa",  # type: ignore[arg-type]
                target_description="Fallback goal",
                language="en",
                requires_agent_execution=False,
                confidence=1.0,
                target_domains=[],
            )

            domain_tool_results = [
                DomainToolResult(tool_name=tr.tool_name, args=tr.args, result=tr.result)
                for tr in final_state.get("executed_tool_results", [])
            ]
            usage = final_state.get("usage") or Usage(
                model=request.model.primary,
                is_fallback=False,
                input_tokens=0,
                output_tokens=0,
                cached_tokens=0,
                thinking_tokens=0,
                total_tokens=final_state.get("accumulated_tokens", 0),
                duration_ms=round((self._clock() - start_time) * 1000),
            )

            return AgentExecutionResult(
                response=response,
                status=status,
                termination_reason=termination_reason,
                goal=goal,
                executed_steps=list(final_state.get("steps", [])),
                observations=list(final_state.get("observations", [])),
                tool_calls=domain_tool_results,
                usage=usage,
                iterations=final_state.get("iteration", 0),
                replans=final_state.get("replans_count", 0),
            )

        except Exception as exc:
            logger.exception("LangGraph workflow error for trace %s: %s", trace_id, exc)
            telemetry.outcome = "error"
            telemetry.error_category = type(exc).__name__

            if self._enable_fallback:
                logger.warning(
                    "Falling back to native AgentExecutor for trace %s due to: %s",
                    trace_id,
                    exc,
                )
                telemetry.fallback_used = True
                telemetry.log_completion()

                fallback_state = AgentState(
                    trace_id=trace_id,
                    user_id=user_id,
                    goal=self._planner.interpret_goal(request.message, request.context),
                    plan=None,
                    iteration=0,
                    replans_count=0,
                    steps=[],
                    observations=[],
                    executed_tools=list(tool_cache.keys()),
                    status=AgentExecutionStatus.PLANNING,
                    termination_reason=None,
                    total_tool_calls=len(tool_cache),
                    accumulated_tokens=0,
                    start_time=start_time,
                )

                return await self._fallback_executor.execute(
                    request=request,
                    llm=llm,
                    trace_id=trace_id,
                    user_id=user_id,
                    tool_handler=tool_handler,
                    initial_state=fallback_state,
                    tool_cache=tool_cache,
                    start_time=start_time,
                    deadline=deadline,
                )

            telemetry.log_completion()
            # Return graceful partial result if fallback is disabled
            fallback_res = CoachChatResult(
                text="I encountered an unexpected execution error while processing your request.",
                follow_ups=["Try again", "Show profile"],
                sources=["Profile"],
                medical_note=False,
            )
            default_goal = AgentGoal(
                goal_type="simple_qa",  # type: ignore[arg-type]
                target_description="Execution error fallback",
                language="en",
                requires_agent_execution=False,
                confidence=0.5,
                target_domains=[],
            )
            return AgentExecutionResult(
                response=fallback_res,
                status=AgentExecutionStatus.FAILED,
                termination_reason=AgentTerminationReason.UNEXPECTED_ERROR,
                goal=default_goal,
                executed_steps=[],
                observations=[],
                tool_calls=[],
                usage=Usage(
                    model=request.model.primary,
                    is_fallback=False,
                    input_tokens=0,
                    output_tokens=0,
                    cached_tokens=0,
                    thinking_tokens=0,
                    total_tokens=0,
                    duration_ms=round((self._clock() - start_time) * 1000),
                ),
            )
