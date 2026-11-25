"""Multi-Agent Coach execution engine with cumulative budgets and native fallback."""

from __future__ import annotations

import asyncio
import copy
import logging
import time
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

from langchain_core.runnables import RunnableConfig

from onusfit_ai.features.coach.application.agent.graph.executor import (
    LangGraphAgentExecutor,
)
from onusfit_ai.features.coach.application.agent.planner import detect_language
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
)
from onusfit_ai.features.coach.application.multi_agent.context import (
    build_shared_execution_context,
)
from onusfit_ai.features.coach.application.multi_agent.graph.builder import (
    get_compiled_multi_agent_graph,
)
from onusfit_ai.features.coach.application.multi_agent.graph.nodes import (
    MultiAgentRuntimeContext,
)
from onusfit_ai.features.coach.application.multi_agent.graph.state import (
    create_initial_multi_agent_state,
)
from onusfit_ai.features.coach.application.multi_agent.mcp_gateway import (
    MultiAgentMcpGateway,
)
from onusfit_ai.features.coach.application.multi_agent.router import SupervisorRouter
from onusfit_ai.features.coach.application.multi_agent.telemetry import (
    MultiAgentTelemetry,
)
from onusfit_ai.features.coach.domain.chat import CoachChatRequest, CoachChatResult
from onusfit_ai.features.coach.domain.multi_agent import (
    A2AMediatorProtocol,
    AgentRole,
    BudgetUsageSnapshot,
    MultiAgentExecutionBudget,
    MultiAgentFinalResult,
    MultiAgentTerminationReason,
    MultiAgentWorkflowStatus,
    MultimodalMealPort,
    OrchestrationMode,
    RoutingDecision,
    WorkoutPlannerPort,
)
from onusfit_ai.shared.contracts.common import Usage
from onusfit_ai.shared.llm.ports import MediaInput, TextGenerator
from onusfit_ai.shared.utils.audio import decode_audio_base64
from onusfit_ai.shared.utils.image import decode_image_base64, strip_jpeg_exif_metadata

logger = logging.getLogger("onusfit_ai.coach.multi_agent.executor")

ToolCallback = Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]]


class _StandaloneA2AFallback:
    """Minimal in-process A2AMediatorProtocol used only when no mediator is injected."""

    def __init__(self) -> None:
        self._handlers: dict[str, Callable[[Any], Awaitable[Any]]] = {}
        self._cancelled: dict[str, str] = {}
        self._available: dict[str, bool] = {}

    def register_agent(
        self,
        agent_id: str,
        handler: Any,
        *,
        role: str = "",
        description: str = "",
        capabilities: list[str] | None = None,
        available: bool = True,
        supports_parallel: bool = True,
    ) -> None:
        self._handlers[agent_id] = handler
        self._available[agent_id] = available

    def discover_agents(
        self, capability: str | None = None, *, only_available: bool = True
    ) -> list[Any]:
        return []

    def cancel_conversation(self, conversation_id: str, reason: str = "cancelled") -> None:
        self._cancelled[conversation_id] = reason

    def is_cancelled(self, conversation_id: str) -> bool:
        return conversation_id in self._cancelled

    async def delegate_task(
        self,
        sender: str,
        recipient: str,
        task: Any,
        conversation_id: str | None = None,
        *,
        max_depth: int = 1,
    ) -> Any:
        conv_id = conversation_id or "conv"
        handler = self._handlers.get(recipient)
        if not handler or not self._available.get(recipient, True):
            return {
                "task_id": task.get("task_id", ""),
                "status": "failed",
                "error_message": f"Agent '{recipient}' unavailable",
                "sender_agent": recipient,
            }
        task_id = task.get("task_id", str(uuid.uuid4()))

        class _Msg:
            def __init__(self) -> None:
                self.message_id = str(uuid.uuid4())
                self.conversation_id = conv_id
                self.sender_agent = sender
                self.recipient_agent = recipient
                self.performative = "request"
                self.payload = task
                self.correlation_id = conv_id
                self.task_id = task_id

            def model_copy(self, *, update: dict[str, Any]) -> Any:
                nxt = copy.copy(self)
                for k, v in update.items():
                    setattr(nxt, k, v)
                return nxt

        reply = await handler(_Msg())
        perf = getattr(reply, "performative", "inform")
        payload = getattr(reply, "payload", {}) or {}
        if perf == "failure":
            return type(
                "_Resp",
                (),
                {
                    "task_id": task_id,
                    "status": "failed",
                    "output_data": {},
                    "error_message": payload.get("error", "failure"),
                    "sender_agent": recipient,
                    "correlation_id": conv_id,
                    "execution_time_ms": 0.0,
                    "partial": False,
                    "deduplicated": False,
                },
            )()
        if perf == "refuse":
            return type(
                "_Resp",
                (),
                {
                    "task_id": task_id,
                    "status": "refused",
                    "output_data": {},
                    "error_message": payload.get("reason", "refused"),
                    "sender_agent": recipient,
                    "correlation_id": conv_id,
                    "execution_time_ms": 0.0,
                    "partial": False,
                    "deduplicated": False,
                },
            )()
        out = payload.get("result", payload)
        return type(
            "_Resp",
            (),
            {
                "task_id": task_id,
                "status": "partial" if perf == "partial" else "completed",
                "output_data": out,
                "error_message": None,
                "sender_agent": recipient,
                "correlation_id": conv_id,
                "execution_time_ms": 0.0,
                "partial": perf == "partial",
                "deduplicated": False,
            },
        )()

    async def execute_task_dag(
        self,
        specs: list[Any],
        conversation_id: str,
        *,
        max_concurrency: int = 3,
        max_depth: int = 1,
        deadline: float | None = None,
    ) -> list[Any]:
        results: list[Any] = []
        completed_data: dict[str, dict[str, Any]] = {}
        for spec in specs:
            task = dict(spec["task"])
            deps = spec.get("depends_on", [])
            upstream = {d: completed_data[d] for d in deps if d in completed_data}
            if upstream:
                inp = dict(task.get("input_data", {}))
                inp["upstream_results"] = upstream
                task["input_data"] = inp
            res = await self.delegate_task(
                spec["sender"],
                spec["recipient"],
                task,
                conversation_id=conversation_id,
                max_depth=max_depth,
            )
            completed_data[spec["task_id"]] = getattr(res, "output_data", {}) or {}
            results.append(res)
        return results

    def aggregate_results(self, responses: list[Any]) -> dict[str, Any]:
        return {"total": len(responses)}


class MultiAgentCoachExecutor:
    """Orchestrates compiled Phase 13 multi-agent workflows with safe Coach fallback."""

    def __init__(
        self,
        *,
        budget: MultiAgentExecutionBudget | None = None,
        router: SupervisorRouter | None = None,
        supervisor: SupervisorAgent | None = None,
        a2a_mediator_factory: Callable[[], A2AMediatorProtocol] | None = None,
        workout_planner: WorkoutPlannerPort | None = None,
        fallback_executor: LangGraphAgentExecutor | None = None,
        enable_fallback: bool = True,
        graph: Any | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._budget = budget or MultiAgentExecutionBudget()
        self._router = router or SupervisorRouter()
        self._supervisor = supervisor or SupervisorAgent()
        self._a2a_factory = a2a_mediator_factory
        self._workout_planner = workout_planner
        self._fallback_executor = fallback_executor
        self._enable_fallback = enable_fallback
        self._graph = graph
        self._clock = clock

    def _get_graph(self) -> Any:
        if self._graph is None:
            self._graph = get_compiled_multi_agent_graph()
        return self._graph

    async def execute(
        self,
        request: CoachChatRequest,
        llm: TextGenerator,
        *,
        trace_id: str,
        user_id: str,
        tool_handler: ToolCallback | None = None,
        mcp_handler: ToolCallback | None = None,
        discovered_tools: list[str] | None = None,
        a2a_mediator: A2AMediatorProtocol | None = None,
        workout_planner: WorkoutPlannerPort | None = None,
        multimodal_port: MultimodalMealPort | None = None,
        available_agents: set[AgentRole] | None = None,
        memory_consent_granted: bool = True,
        allow_mutations: bool = False,
        durable_node_approval_verified: bool = False,
        cancel_event: asyncio.Event | None = None,
    ) -> MultiAgentFinalResult:
        """Run bounded LangGraph multi-agent orchestration for one request."""
        # Pre-validate & EXIF-strip attachments before budget/LLM spend.
        validated_media: list[MediaInput] = []
        if request.audio is not None:
            validated_media.append(
                MediaInput(
                    mime_type=request.audio.mime_type,
                    data=decode_audio_base64(request.audio.base64),
                )
            )
        if request.image is not None:
            raw_img = decode_image_base64(
                request.image.base64, claimed_mime_type=request.image.mime_type
            )
            validated_media.append(
                MediaInput(
                    mime_type=request.image.mime_type,
                    data=strip_jpeg_exif_metadata(raw_img),
                )
            )

        start = self._clock()
        deadline_s = min(self._budget.deadline_seconds, request.deadline_ms / 1000.0)
        deadline = start + max(1.0, deadline_s)
        tracker = CumulativeBudgetTracker(
            budget=self._budget,
            clock=self._clock,
            start_time=start,
            deadline=deadline,
        )
        mediator = (
            a2a_mediator
            or (self._a2a_factory() if self._a2a_factory is not None else None)
            or _StandaloneA2AFallback()
        )
        if cancel_event is not None and cancel_event.is_set():
            tracker.cancel("caller_cancelled")
            mediator.cancel_conversation(trace_id, "caller_cancelled")

        gateway = MultiAgentMcpGateway(
            budget_tracker=tracker,
            mcp_handler=mcp_handler,
            native_handler=tool_handler,
            discovered_tools=discovered_tools,
            allow_mutations=allow_mutations,
            durable_node_approval_verified=durable_node_approval_verified,
        )
        telemetry = MultiAgentTelemetry(trace_id=trace_id, start_time=start)
        shared_ctx = build_shared_execution_context(
            request,
            trace_id=trace_id,
            user_id=user_id,
            language=detect_language(request.message),
            memory_consent_granted=memory_consent_granted,
        )
        planner_port = workout_planner or self._workout_planner
        specialists: dict[AgentRole, BaseSpecialistAgent] = {
            AgentRole.WORKOUT: WorkoutAgent(
                gateway=gateway,
                budget=tracker,
                workout_planner=planner_port,
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
        eff_available = (
            available_agents if available_agents is not None else set(specialists.keys())
        )
        runtime_ctx = MultiAgentRuntimeContext(
            request=request,
            llm=llm,
            router=self._router,
            supervisor=self._supervisor,
            specialists=specialists,
            a2a_mediator=mediator,
            gateway=gateway,
            budget=tracker,
            telemetry=telemetry,
            available_agents=eff_available,
            clock=self._clock,
            media=validated_media or None,
        )

        initial_state = create_initial_multi_agent_state(
            shared_context=shared_ctx,
            max_replanning_attempts=self._budget.max_replanning_attempts,
        )
        max_graph_steps = max(12, 8 + self._budget.max_replanning_attempts * 5)
        config = RunnableConfig(
            recursion_limit=max_graph_steps,
            configurable={"multi_agent_ctx": runtime_ctx, "thread_id": trace_id},
        )

        cancel_watcher: asyncio.Task[None] | None = None
        if cancel_event is not None:

            async def _watch_cancel() -> None:
                await cancel_event.wait()
                tracker.cancel("caller_cancelled")
                mediator.cancel_conversation(trace_id, "caller_cancelled")

            cancel_watcher = asyncio.create_task(_watch_cancel())

        try:
            graph = self._get_graph()
            final_state = await graph.ainvoke(initial_state, config=config)
            telemetry.log_workflow_completed()

            snap = tracker.snapshot()
            raw_resp = final_state.get("response")
            response = raw_resp or self._supervisor._deterministic_fallback_result(
                shared_ctx=shared_ctx,
                recommendations=list(final_state.get("recommendations", [])),
                evidence=list(final_state.get("evidence", [])),
                executed_tools=list(final_state.get("executed_tools", [])),
                has_medical=bool(final_state.get("medical_halted")),
            )
            routing = final_state.get("routing_decision") or RoutingDecision(
                mode=OrchestrationMode.BYPASS,
                goal_type="fallback_bypass",
                language=shared_ctx.language,
            )
            usage = final_state.get("usage") or Usage(
                model=request.model.primary,
                is_fallback=False,
                input_tokens=snap.input_tokens,
                output_tokens=snap.output_tokens,
                cached_tokens=0,
                thinking_tokens=0,
                total_tokens=snap.total_tokens,
                duration_ms=round(max(0.0, (self._clock() - start) * 1000.0)),
            )
            return MultiAgentFinalResult(
                response=response,
                status=final_state.get("status", MultiAgentWorkflowStatus.COMPLETED),
                termination_reason=(
                    final_state.get("termination_reason")
                    or MultiAgentTerminationReason.GOAL_SATISFIED
                ),
                routing_decision=routing,
                agent_results=list(final_state.get("agent_results", [])),
                conflicts_resolved=list(final_state.get("conflicts_resolved", [])),
                budget_snapshot=snap,
                usage=usage,
                replan_attempts=int(final_state.get("replan_attempts", 0)),
                fallback_used=False,
                partial_results=bool(final_state.get("partial_results", False)),
                executed_tools=list(final_state.get("executed_tools", [])),
            )
        except Exception as exc:
            logger.warning(
                "Multi-agent workflow error (%s); fallback_enabled=%s",
                type(exc).__name__,
                self._enable_fallback,
            )
            telemetry.outcome = "error"
            telemetry.fallback_reason = type(exc).__name__
            telemetry.error_categories.append(type(exc).__name__)

            if self._enable_fallback:
                telemetry.fallback_used = True
                telemetry.termination_reason = (
                    MultiAgentTerminationReason.NATIVE_FALLBACK_USED.value
                )
                telemetry.log_workflow_completed()
                return await self._execute_native_fallback(
                    request=request,
                    llm=llm,
                    trace_id=trace_id,
                    user_id=user_id,
                    tool_handler=self._cached_tool_handler(
                        tool_handler or mcp_handler, gateway.export_cache_signatures()
                    ),
                    shared_ctx=shared_ctx,
                    snap=tracker.snapshot(),
                    start=start,
                )

            telemetry.log_workflow_completed()
            return MultiAgentFinalResult(
                response=CoachChatResult(
                    text="An error occurred while coordinating fitness specialists.",
                    follow_ups=["Try again", "Review my profile"],
                    sources=["Profile"],
                    medical_note=False,
                ),
                status=MultiAgentWorkflowStatus.FAILED,
                termination_reason=MultiAgentTerminationReason.UNEXPECTED_ERROR,
                routing_decision=RoutingDecision(
                    mode=OrchestrationMode.BYPASS,
                    goal_type="error",
                    language=shared_ctx.language,
                ),
                budget_snapshot=tracker.snapshot(),
                usage=Usage(
                    model=request.model.primary,
                    is_fallback=False,
                    input_tokens=0,
                    output_tokens=0,
                    cached_tokens=0,
                    thinking_tokens=0,
                    total_tokens=0,
                    duration_ms=round(max(0.0, (self._clock() - start) * 1000.0)),
                ),
                fallback_used=False,
            )
        finally:
            if cancel_watcher is not None and not cancel_watcher.done():
                cancel_watcher.cancel()

    def _cached_tool_handler(
        self,
        base_handler: ToolCallback | None,
        cached_signatures: dict[str, dict[str, Any]],
    ) -> ToolCallback | None:
        """Serve already-executed tools from cache during native fallback."""
        if base_handler is None and not cached_signatures:
            return None
        import json

        async def _handler(tool_name: str, args: dict[str, Any]) -> dict[str, Any]:
            sig = f"{tool_name}:{json.dumps(args, sort_keys=True, separators=(',', ':'))}"
            if sig in cached_signatures:
                return copy.deepcopy(cached_signatures[sig])
            if base_handler is not None:
                return await base_handler(tool_name, args)
            return {"error": f"Tool '{tool_name}' unavailable during fallback"}

        return _handler

    async def _execute_native_fallback(
        self,
        *,
        request: CoachChatRequest,
        llm: TextGenerator,
        trace_id: str,
        user_id: str,
        tool_handler: ToolCallback | None,
        shared_ctx: Any,
        snap: BudgetUsageSnapshot,
        start: float,
    ) -> MultiAgentFinalResult:
        """Delegate safely to existing Phase 10 LangGraph / Phase 09 native Coach path."""
        fb = self._fallback_executor or LangGraphAgentExecutor(clock=self._clock)
        try:
            agent_res = await fb.execute(
                request=request,
                llm=llm,
                trace_id=trace_id,
                user_id=user_id,
                tool_handler=tool_handler,
            )
            return MultiAgentFinalResult(
                response=agent_res.response,
                status=MultiAgentWorkflowStatus.COMPLETED,
                termination_reason=MultiAgentTerminationReason.NATIVE_FALLBACK_USED,
                routing_decision=RoutingDecision(
                    mode=OrchestrationMode.BYPASS,
                    goal_type="native_fallback",
                    language=shared_ctx.language,
                    bypass_reason="Multi-agent workflow fell back to standard Coach agent.",
                ),
                budget_snapshot=snap,
                usage=agent_res.usage
                or Usage(
                    model=request.model.primary,
                    is_fallback=False,
                    input_tokens=0,
                    output_tokens=0,
                    cached_tokens=0,
                    thinking_tokens=0,
                    total_tokens=0,
                    duration_ms=round(max(0.0, (self._clock() - start) * 1000.0)),
                ),
                fallback_used=True,
                partial_results=False,
                executed_tools=[t.tool_name for t in agent_res.tool_calls],
            )
        except Exception:
            fallback_result = self._supervisor._deterministic_fallback_result(
                shared_ctx=shared_ctx,
                recommendations=[],
                evidence=[],
                executed_tools=[],
                has_medical=bool(shared_ctx.medical_red_flags),
            )
            return MultiAgentFinalResult(
                response=fallback_result,
                status=MultiAgentWorkflowStatus.PARTIAL,
                termination_reason=MultiAgentTerminationReason.NATIVE_FALLBACK_USED,
                routing_decision=RoutingDecision(
                    mode=OrchestrationMode.BYPASS,
                    goal_type="deterministic_fallback",
                    language=shared_ctx.language,
                ),
                budget_snapshot=snap,
                usage=Usage(
                    model=request.model.primary,
                    is_fallback=False,
                    input_tokens=snap.input_tokens,
                    output_tokens=snap.output_tokens,
                    cached_tokens=0,
                    thinking_tokens=0,
                    total_tokens=snap.total_tokens,
                    duration_ms=round(max(0.0, (self._clock() - start) * 1000.0)),
                ),
                fallback_used=True,
                partial_results=True,
            )
