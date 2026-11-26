"""End-to-end compiled LangGraph workflow tests for Phase 13 Multi-Agent Systems."""

import asyncio
from typing import Any

import pytest

from conftest import FakeLlm
from onusfit_ai.features.coach.application.agent.executor import AgentExecutor
from onusfit_ai.features.coach.application.agent.graph.executor import (
    LangGraphAgentExecutor,
)
from onusfit_ai.features.coach.application.multi_agent import (
    MultiAgentCoachExecutor,
    SupervisorRouter,
)
from onusfit_ai.features.coach.application.multi_agent.context import (
    build_shared_execution_context,
)
from onusfit_ai.features.coach.domain.chat import CoachChatRequest, UserFitnessContext
from onusfit_ai.features.coach.domain.multi_agent import (
    AgentRole,
    MultiAgentExecutionBudget,
    MultiAgentTerminationReason,
    MultiAgentWorkflowStatus,
    OrchestrationMode,
)
from onusfit_ai.features.mcp.application.a2a import A2AMediator
from onusfit_ai.shared.contracts.common import ModelSelection


def _build_req(message: str, *, deadline_ms: int = 20000) -> CoachChatRequest:
    return CoachChatRequest(
        message=message,
        model=ModelSelection(primary="gemini-3.5-flash-lite", fallback="gemini-3.1-flash-lite"),
        deadlineMs=deadline_ms,
        context=UserFitnessContext.model_validate(
            {
                "profile": {
                    "display_name": "Karthik",
                    "primary_goal": "fat_loss",
                    "experience_level": "intermediate",
                    "preferred_workout_place": "gym",
                    "workout_days_per_week": 4,
                    "daily_calorie_target": 2100,
                    "daily_protein_grams": 140,
                },
                "today_nutrition": {
                    "calories_consumed": 1500,
                    "protein_grams": 105,
                    "carbs_grams": 160,
                    "fat_grams": 45,
                    "water_intake_ml": 2000,
                },
                "recent_workouts": [
                    {
                        "name": "Push Day",
                        "duration_minutes": 45,
                        "volume_kg": 3800,
                        "total_sets": 12,
                        "completed_at": "2026-11-24T08:00:00Z",
                    }
                ],
                "active_goals": [
                    {
                        "title": "Reach 72kg",
                        "category": "weight",
                        "target_value": 72,
                        "current_value": 76,
                        "unit": "kg",
                    }
                ],
            }
        ),
        memories=["Prefers morning workouts"],
    )


def _mock_tool_handler(tool_log: list[str], *, fail_workout_history: bool = False) -> Any:
    async def _handler(name: str, _args: dict[str, Any]) -> dict[str, Any]:
        tool_log.append(name)
        if name == "get_recent_workouts":
            if fail_workout_history:
                raise RuntimeError("transient backend timeout")
            return {
                "workouts": [
                    {"name": "Push Day", "totalVolumeKg": 3800},
                    {"name": "Pull Day", "totalVolumeKg": 4100},
                ]
            }
        if name == "get_nutrition_summary":
            return {
                "days": [
                    {"calories": 2050, "proteinG": 135},
                    {"calories": 2100, "proteinG": 142},
                ]
            }
        if name == "get_weight_trend":
            return {
                "logs": [
                    {"weightKg": 77.2},
                    {"weightKg": 76.1},
                ]
            }
        if name == "retrieve_fitness_knowledge":
            return {
                "chunks": [
                    {
                        "documentTitle": "Recovery Science",
                        "citation": "ACSM 2024",
                        "content": "Space high-intensity compound lifts 48h apart.",
                    }
                ]
            }
        return {"ok": True}

    return _handler


def test_supervisor_router_covers_en_ta_tanglish_and_bypass() -> None:
    router = SupervisorRouter()

    for prompt, exp_mode, exp_lang in [
        ("Hi coach", OrchestrationMode.BYPASS, "en"),
        ("வணக்கம்", OrchestrationMode.BYPASS, "ta"),
        ("Vanakkam", OrchestrationMode.BYPASS, "tanglish"),
        ("How many calories did I log today?", OrchestrationMode.BYPASS, "en"),
    ]:
        ctx = build_shared_execution_context(
            _build_req(prompt),
            trace_id="t-route",
            user_id="u-1",
            language=exp_lang,  # type: ignore[arg-type]
        )
        d = router.route(ctx)
        assert d.mode == exp_mode

    for prompt, exp_agents in [
        (
            "Create a workout plan based on my recent progress",
            {AgentRole.PROGRESS, AgentRole.WORKOUT},
        ),
        (
            "Analyze my workout and nutrition consistency",
            {AgentRole.WORKOUT, AgentRole.NUTRITION},
        ),
        (
            "Adjust my training based on recovery feedback",
            {AgentRole.RECOVERY, AgentRole.WORKOUT},
        ),
        (
            "Review my weekly fitness progress",
            {AgentRole.PROGRESS},
        ),
        (
            "Recommend a balanced fitness routine",
            {AgentRole.WORKOUT, AgentRole.NUTRITION, AgentRole.RECOVERY},
        ),
        (
            "Romba tired aaguthu, inniku workout plan ah adjust pannunga",
            {AgentRole.RECOVERY, AgentRole.WORKOUT},
        ),
    ]:
        ctx = build_shared_execution_context(
            _build_req(prompt),
            trace_id="t-route",
            user_id="u-1",
            language="en",
        )
        d = router.route(ctx)
        assert exp_agents.issubset(set(d.selected_agents))


@pytest.mark.asyncio
async def test_compiled_graph_sequential_and_parallel_with_shared_tool_cache() -> None:
    llm = FakeLlm(
        text='{"text":"Great consistency! Keep hitting 140g protein and 4 weekly workouts.",'
        '"followUps":["Plan next week"],"sources":["Profile"],"medicalNote":false}'
    )
    tool_log: list[str] = []
    executor = MultiAgentCoachExecutor(a2a_mediator_factory=A2AMediator)

    # Parallel Workout + Nutrition consistency
    res_par = await executor.execute(
        _build_req("Analyze my workout and nutrition consistency."),
        llm,
        trace_id="trace-par-1",
        user_id="u-1",
        mcp_handler=_mock_tool_handler(tool_log),
    )
    assert res_par.status == MultiAgentWorkflowStatus.COMPLETED
    assert res_par.routing_decision.mode == OrchestrationMode.PARALLEL
    assert {AgentRole.WORKOUT, AgentRole.NUTRITION}.issubset(
        {r.agent_role for r in res_par.agent_results}
    )
    assert res_par.budget_snapshot.llm_calls == 1
    assert res_par.usage.total_tokens == 125

    # Sequential Progress -> Workout plan creation
    seq_tools: list[str] = []
    res_seq = await executor.execute(
        _build_req("Create a workout plan based on my recent progress."),
        llm,
        trace_id="trace-seq-1",
        user_id="u-1",
        mcp_handler=_mock_tool_handler(seq_tools),
    )
    assert res_seq.status == MultiAgentWorkflowStatus.COMPLETED
    assert res_seq.routing_decision.mode == OrchestrationMode.SEQUENTIAL
    roles = [r.agent_role for r in res_seq.agent_results]
    assert roles == [AgentRole.PROGRESS, AgentRole.WORKOUT]
    # Progress + Workout both need get_recent_workouts(days=14); shared cache executes once!
    assert seq_tools.count("get_recent_workouts") == 1


@pytest.mark.asyncio
async def test_compiled_graph_bypass_tamil_tanglish_and_medical_halt() -> None:
    llm = FakeLlm(
        text='{"text":"வணக்கம்! இன்று உங்கள் உடற்பயிற்சிக்கு உதவ தயார்.",'
        '"followUps":["Check protein"],"sources":["Profile"],"medicalNote":false}'
    )
    executor = MultiAgentCoachExecutor(a2a_mediator_factory=A2AMediator)
    bypass_res = await executor.execute(
        _build_req("வணக்கம்"),
        llm,
        trace_id="trace-ta-bypass",
        user_id="u-1",
        mcp_handler=_mock_tool_handler([]),
    )
    assert bypass_res.status == MultiAgentWorkflowStatus.BYPASSED
    assert bypass_res.termination_reason == MultiAgentTerminationReason.SIMPLE_QUERY_BYPASS
    assert bypass_res.budget_snapshot.agent_invocations == 0
    assert bypass_res.budget_snapshot.tool_calls == 0

    # Medical red flag halts strenuous planning safely
    med_res = await executor.execute(
        _build_req("I have chest pain and dizziness; give me a new workout plan."),
        FakeLlm(
            text='{"text":"Please stop exercise and consult a healthcare provider.",'
            '"followUps":[],"sources":["Profile"],"medicalNote":true}'
        ),
        trace_id="trace-med",
        user_id="u-1",
        mcp_handler=_mock_tool_handler([]),
    )
    assert med_res.termination_reason == MultiAgentTerminationReason.MEDICAL_RED_FLAG_HALT
    assert med_res.response.medical_note is True


@pytest.mark.asyncio
async def test_compiled_graph_bounded_replan_budget_caps_and_cancellation() -> None:
    # 1. Partial agent failure triggers single bounded replan to KnowledgeAgent
    class _BrokenA2AMediator(A2AMediator):
        async def execute_task_dag(
            self, specs: list[Any], conversation_id: str, **kwargs: Any
        ) -> list[Any]:
            res = await super().execute_task_dag(specs, conversation_id, **kwargs)
            patched = []
            for r in res:
                if r.sender_agent == "workout":
                    patched.append(
                        r.model_copy(update={"status": "failed", "error_message": "workout err"})
                    )
                else:
                    patched.append(r)
            return patched

    llm = FakeLlm()
    executor = MultiAgentCoachExecutor(
        budget=MultiAgentExecutionBudget(max_replanning_attempts=1, max_agent_invocations=6),
        a2a_mediator_factory=_BrokenA2AMediator,
    )
    partial_res = await executor.execute(
        _build_req("Analyze my workout and nutrition consistency."),
        llm,
        trace_id="trace-replan",
        user_id="u-1",
        mcp_handler=_mock_tool_handler([]),
    )
    assert partial_res.replan_attempts == 1
    assert partial_res.partial_results is True
    assert any(r.agent_role == AgentRole.KNOWLEDGE for r in partial_res.agent_results)

    # 2a. Cost-aware router prunes tasks proactively when max_agent_invocations=1
    strict_executor = MultiAgentCoachExecutor(
        budget=MultiAgentExecutionBudget(max_agent_invocations=1),
        a2a_mediator_factory=A2AMediator,
    )
    capped_res = await strict_executor.execute(
        _build_req("Recommend a balanced fitness routine."),
        llm,
        trace_id="trace-cap-prune",
        user_id="u-1",
        mcp_handler=_mock_tool_handler([]),
    )
    assert capped_res.budget_snapshot.agent_invocations == 1
    assert capped_res.routing_decision.mode == OrchestrationMode.SINGLE_AGENT

    # 2b. Runtime CumulativeBudgetTracker enforces MAX_AGENT_INVOCATIONS_REACHED
    class _UnboundedRouter(SupervisorRouter):
        def route(self, shared_ctx: Any, **kwargs: Any) -> Any:
            return super().route(
                shared_ctx,
                available_agents=kwargs.get("available_agents"),
                budget=MultiAgentExecutionBudget(max_agent_invocations=5),
            )

    runtime_cap_exec = MultiAgentCoachExecutor(
        budget=MultiAgentExecutionBudget(max_agent_invocations=1, max_replanning_attempts=0),
        router=_UnboundedRouter(),
        a2a_mediator_factory=A2AMediator,
    )
    runtime_cap_res = await runtime_cap_exec.execute(
        _build_req("Analyze my workout and nutrition consistency."),
        llm,
        trace_id="trace-cap-runtime",
        user_id="u-1",
        mcp_handler=_mock_tool_handler([]),
    )
    assert runtime_cap_res.budget_snapshot.agent_invocations == 1
    assert (
        runtime_cap_res.termination_reason
        == MultiAgentTerminationReason.MAX_AGENT_INVOCATIONS_REACHED
    )

    # 3. Cumulative tool_call cap + token cap + deadline check
    tool_cap_exec = MultiAgentCoachExecutor(
        budget=MultiAgentExecutionBudget(max_tool_calls=1, max_total_tokens=500),
        a2a_mediator_factory=A2AMediator,
    )
    tool_cap_res = await tool_cap_exec.execute(
        _build_req("Analyze my workout and nutrition consistency."),
        llm,
        trace_id="trace-tcap",
        user_id="u-1",
        mcp_handler=_mock_tool_handler([]),
    )
    assert tool_cap_res.budget_snapshot.tool_calls <= 1
    assert tool_cap_res.budget_snapshot.total_tokens <= 500

    now = 100.0
    deadline_exec = MultiAgentCoachExecutor(
        budget=MultiAgentExecutionBudget(deadline_seconds=1.0, deadline_margin_s=2.0),
        a2a_mediator_factory=A2AMediator,
        clock=lambda: now,
    )
    dl_res = await deadline_exec.execute(
        _build_req("Analyze my workout and nutrition consistency."),
        llm,
        trace_id="trace-dl",
        user_id="u-1",
        mcp_handler=_mock_tool_handler([]),
    )
    assert dl_res.status == MultiAgentWorkflowStatus.DEADLINE_EXCEEDED
    assert dl_res.termination_reason == MultiAgentTerminationReason.DEADLINE_APPROACHING

    # 4. Pre-cancelled event stops execution immediately
    ev = asyncio.Event()
    ev.set()
    cancel_res = await executor.execute(
        _build_req("Analyze my workout and nutrition consistency."),
        llm,
        trace_id="trace-cancel",
        user_id="u-1",
        mcp_handler=_mock_tool_handler([]),
        cancel_event=ev,
    )
    assert cancel_res.status == MultiAgentWorkflowStatus.CANCELLED
    assert cancel_res.termination_reason == MultiAgentTerminationReason.CANCELLED


@pytest.mark.asyncio
async def test_graph_exception_falls_back_to_native_coach_path() -> None:
    class _BrokenGraph:
        async def ainvoke(self, *_args: Any, **_kwargs: Any) -> Any:
            raise RuntimeError("simulated LangGraph boom")

    llm = FakeLlm(
        text='{"text":"Fallback response succeeded.",'
        '"followUps":["Keep going"],"sources":["Profile"],"medicalNote":false}'
    )
    fb = LangGraphAgentExecutor(fallback_executor=AgentExecutor(), graph=_BrokenGraph())
    executor = MultiAgentCoachExecutor(graph=_BrokenGraph(), fallback_executor=fb)

    res = await executor.execute(
        _build_req("Hi Coach"),
        llm,
        trace_id="trace-fb",
        user_id="u-1",
        tool_handler=_mock_tool_handler([]),
    )
    assert res.fallback_used is True
    assert res.termination_reason == MultiAgentTerminationReason.NATIVE_FALLBACK_USED
    assert "Fallback response succeeded" in res.response.text
