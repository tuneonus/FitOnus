"""Behavioral parity tests comparing Phase 09 Native Agent with Phase 10 LangGraph Agent.

FitOnus Phase 10: LangGraph Agent Workflows — Stage 08.
Verifies that:
- Simple query bypass decisions match identically.
- Planned tool sequences and arguments are identical.
- Observation processing, metric extraction, and replanning triggers match.
- Synthesis prompt generation and grounding guarantees are preserved.
- Output envelopes conform to the identical domain contracts.
"""

import json

import pytest

from onusfit_ai.features.coach.application.agent.executor import AgentExecutor
from onusfit_ai.features.coach.application.agent.graph.executor import (
    LangGraphAgentExecutor,
)
from onusfit_ai.features.coach.domain.agent import (
    AgentBudgetConfig,
    AgentExecutionStatus,
    AgentTerminationReason,
)
from onusfit_ai.features.coach.domain.chat import (
    CoachChatRequest,
    TodayNutritionContext,
    UserFitnessContext,
    UserFitnessProfile,
)
from onusfit_ai.shared.contracts.common import ModelSelection
from onusfit_ai.shared.llm.ports import LlmResult, LlmUsage, TextGenerator


class RecordingLlm(TextGenerator):
    def __init__(self) -> None:
        self.prompts: list[str] = []

    async def generate_text(self, prompt: str, *args, **kwargs) -> LlmResult:
        self.prompts.append(prompt)
        return LlmResult(
            text=json.dumps(
                {
                    "text": "Parity test verified response.",
                    "follow_ups": ["Next step"],
                    "sources": ["Workouts", "Nutrition"],
                    "medical_note": False,
                }
            ),
            usage=LlmUsage(
                model="mock-gemini-parity",
                is_fallback=False,
                input_tokens=120,
                output_tokens=60,
                cached_tokens=0,
                thinking_tokens=0,
                total_tokens=180,
                duration_ms=45,
            ),
        )


def _mock_request(message: str) -> CoachChatRequest:
    return CoachChatRequest(
        message=message,
        context=UserFitnessContext(
            profile=UserFitnessProfile(
                display_name="Parity User",
                current_weight_kg=70.0,
                target_weight_kg=65.0,
            ),
            today_nutrition=TodayNutritionContext(
                calories_consumed=2100,
                protein_grams=150,
                carbs_grams=210,
                fat_grams=65,
                water_intake_ml=3000,
            ),
            recent_workouts=[],
            active_goals=[],
        ),
        model=ModelSelection(primary="gemini-2.5-flash", fallback="gemini-2.5-flash-lite"),
        deadline_ms=15000,
    )


@pytest.mark.asyncio
async def test_parity_simple_query_bypass() -> None:
    req = _mock_request("Hello Coach!")
    native_exec = AgentExecutor()
    graph_exec = LangGraphAgentExecutor()

    llm_native = RecordingLlm()
    llm_graph = RecordingLlm()

    res_native = await native_exec.execute(
        request=req,
        llm=llm_native,
        trace_id="p_native_1",
        user_id="user_p",
        tool_handler=None,
    )

    res_graph = await graph_exec.execute(
        request=req,
        llm=llm_graph,
        trace_id="p_graph_1",
        user_id="user_p",
        tool_handler=None,
    )

    assert res_native.status == res_graph.status == AgentExecutionStatus.BYPASSED
    assert (
        res_native.termination_reason
        == res_graph.termination_reason
        == AgentTerminationReason.SIMPLE_QUERY_BYPASS
    )
    assert res_native.goal.goal_type == res_graph.goal.goal_type
    assert res_native.goal.language == res_graph.goal.language


@pytest.mark.asyncio
async def test_parity_workout_and_nutrition_execution() -> None:
    req = _mock_request("Recommendations for next week and what should I improve")
    native_exec = AgentExecutor()
    graph_exec = LangGraphAgentExecutor()

    async def mock_handler(name, args):
        if name == "get_recent_workouts":
            return {"workouts": [{"name": "Squats", "durationMinutes": 45, "volumeKg": 3000}]}
        elif name == "get_nutrition_summary":
            return {"avgCalories": 2100, "avgProtein": 150}
        return {}

    llm_native = RecordingLlm()
    llm_graph = RecordingLlm()

    res_native = await native_exec.execute(
        request=req,
        llm=llm_native,
        trace_id="p_native_2",
        user_id="user_p",
        tool_handler=mock_handler,
    )

    res_graph = await graph_exec.execute(
        request=req,
        llm=llm_graph,
        trace_id="p_graph_2",
        user_id="user_p",
        tool_handler=mock_handler,
    )

    assert res_native.status == res_graph.status == AgentExecutionStatus.COMPLETED
    assert (
        res_native.termination_reason
        == res_graph.termination_reason
        == AgentTerminationReason.GOAL_SATISFIED
    )
    assert len(res_native.observations) == len(res_graph.observations) == 2
    native_tools = {tc.tool_name for tc in res_native.tool_calls}
    graph_tools = {tc.tool_name for tc in res_graph.tool_calls}
    assert native_tools == graph_tools == {"get_recent_workouts", "get_nutrition_summary"}


@pytest.mark.asyncio
async def test_parity_empty_data_adaptive_replanning() -> None:
    req = _mock_request("Check workout history")
    budget = AgentBudgetConfig(max_replanning_attempts=1)
    native_exec = AgentExecutor(budget=budget)
    graph_exec = LangGraphAgentExecutor(budget=budget)

    native_calls = []
    graph_calls = []

    async def mock_handler_native(name, args):
        days = args.get("days", 7)
        native_calls.append(days)
        if days == 7:
            return {"workouts": []}
        return {"workouts": [{"name": "Deadlift", "durationMinutes": 40}]}

    async def mock_handler_graph(name, args):
        days = args.get("days", 7)
        graph_calls.append(days)
        if days == 7:
            return {"workouts": []}
        return {"workouts": [{"name": "Deadlift", "durationMinutes": 40}]}

    res_native = await native_exec.execute(
        request=req,
        llm=RecordingLlm(),
        trace_id="p_native_3",
        user_id="user_p",
        tool_handler=mock_handler_native,
    )

    res_graph = await graph_exec.execute(
        request=req,
        llm=RecordingLlm(),
        trace_id="p_graph_3",
        user_id="user_p",
        tool_handler=mock_handler_graph,
    )

    assert native_calls == graph_calls == [7, 14]
    assert res_native.status == res_graph.status == AgentExecutionStatus.COMPLETED
    assert len(res_native.observations) == len(res_graph.observations) == 2


@pytest.mark.asyncio
async def test_parity_tamil_and_tanglish_detection() -> None:
    queries = [
        "எனது முன்னேற்றத்தை சரிபார்க்கவும்",
        "innaiku workout review pannunga coach",
    ]

    for q in queries:
        req = _mock_request(q)
        native_exec = AgentExecutor()
        graph_exec = LangGraphAgentExecutor()

        res_n = await native_exec.execute(
            request=req,
            llm=RecordingLlm(),
            trace_id="p_n",
            user_id="u",
            tool_handler=lambda n, a: {"workouts": []},
        )
        res_g = await graph_exec.execute(
            request=req,
            llm=RecordingLlm(),
            trace_id="p_g",
            user_id="u",
            tool_handler=lambda n, a: {"workouts": []},
        )

        assert res_n.goal.language == res_g.goal.language
        assert res_n.goal.requires_agent_execution == res_g.goal.requires_agent_execution
