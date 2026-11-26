"""End-to-end integration and edge-case tests for LangGraph agent workflows.

FitOnus Phase 10: LangGraph Agent Workflows — Stage 05, 06, 07, 08.
Tests:
- End-to-end compiled graph execution.
- Parallel tool execution.
- Missing data & adaptive replanning.
- Budget and deadline protections.
- Fault tolerance, partial observations, and fallback behavior.
- Tamil and Tanglish multilingual workflows.
"""

import json

import pytest

from onusfit_ai.features.coach.application.agent.graph.executor import (
    LangGraphAgentExecutor,
)
from onusfit_ai.features.coach.domain.agent import (
    AgentBudgetConfig,
    AgentExecutionStatus,
    AgentGoalType,
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


class MockLlm(TextGenerator):
    def __init__(self, reply_text: str | None = None) -> None:
        self.reply_text = reply_text or json.dumps(
            {
                "text": "Great job on completing your 3 workouts and hitting 2000 calories!",
                "follow_ups": ["How can I build more strength?", "Show next workout"],
                "sources": ["Workouts", "Nutrition"],
                "medical_note": False,
            }
        )
        self.last_prompt = ""
        self.call_count = 0

    async def generate_text(self, prompt: str, *args, **kwargs) -> LlmResult:
        self.last_prompt = prompt
        self.call_count += 1
        return LlmResult(
            text=self.reply_text,
            usage=LlmUsage(
                model="mock-gemini-flash",
                is_fallback=False,
                input_tokens=150,
                output_tokens=75,
                cached_tokens=0,
                thinking_tokens=0,
                total_tokens=225,
                duration_ms=50,
            ),
        )


def _mock_request(message: str, deadline_ms: int = 15000) -> CoachChatRequest:
    return CoachChatRequest(
        message=message,
        context=UserFitnessContext(
            profile=UserFitnessProfile(
                display_name="Dev Shan",
                current_weight_kg=78.0,
                target_weight_kg=72.0,
                primary_goal="Weight Loss",
            ),
            today_nutrition=TodayNutritionContext(
                calories_consumed=1900,
                protein_grams=130,
                carbs_grams=190,
                fat_grams=55,
                water_intake_ml=2800,
            ),
            recent_workouts=[],
            active_goals=[],
        ),
        model=ModelSelection(primary="gemini-2.5-flash", fallback="gemini-2.5-flash-lite"),
        deadline_ms=deadline_ms,
    )


@pytest.mark.asyncio
async def test_workflow_simple_query_bypass() -> None:
    llm = MockLlm()
    executor = LangGraphAgentExecutor()
    req = _mock_request("Hi coach, good morning!")

    tool_called = False

    async def mock_handler(name, args):
        nonlocal tool_called
        tool_called = True
        return {}

    result = await executor.execute(
        request=req,
        llm=llm,
        trace_id="trace_bypass",
        user_id="user_1",
        tool_handler=mock_handler,
    )

    assert tool_called is False
    assert result.status == AgentExecutionStatus.BYPASSED
    assert result.termination_reason == AgentTerminationReason.SIMPLE_QUERY_BYPASS
    assert result.goal.goal_type == AgentGoalType.GREETING
    assert len(result.executed_steps) == 0


@pytest.mark.asyncio
async def test_workflow_multitool_progress_analysis() -> None:
    llm = MockLlm()
    executor = LangGraphAgentExecutor()
    req = _mock_request("How am I doing on workouts and nutrition over the past week?")

    executed_tools = []

    async def mock_handler(name, args):
        executed_tools.append((name, args))
        if name == "get_recent_workouts":
            return {
                "workouts": [
                    {
                        "name": "Upper Body",
                        "durationMinutes": 45,
                        "volumeKg": 3200,
                        "caloriesBurned": 350,
                    }
                ]
            }
        elif name == "get_nutrition_summary":
            return {
                "days": [{"calories": 2000, "protein": 140}],
                "avgCalories": 2000,
                "avgProtein": 140,
            }
        return {}

    result = await executor.execute(
        request=req,
        llm=llm,
        trace_id="trace_progress",
        user_id="user_2",
        tool_handler=mock_handler,
    )

    assert result.status == AgentExecutionStatus.COMPLETED
    assert result.termination_reason == AgentTerminationReason.GOAL_SATISFIED
    assert len(executed_tools) >= 2
    tool_names = {t[0] for t in executed_tools}
    assert "get_recent_workouts" in tool_names
    assert "get_nutrition_summary" in tool_names
    assert len(result.observations) >= 2
    assert "Workouts" in result.response.sources
    assert "Nutrition" in result.response.sources


@pytest.mark.asyncio
async def test_workflow_adaptive_replanning_on_empty_data() -> None:
    llm = MockLlm()
    executor = LangGraphAgentExecutor()
    req = _mock_request("Check my workout history")

    workout_queries = []

    async def mock_handler(name, args):
        if name == "get_recent_workouts":
            days = args.get("days", 7)
            workout_queries.append(days)
            if days == 7:
                # First window returns empty
                return {"workouts": []}
            else:
                # Expanded window returns earlier activity
                return {
                    "workouts": [
                        {
                            "name": "Leg Day",
                            "durationMinutes": 50,
                            "volumeKg": 4000,
                            "caloriesBurned": 420,
                        }
                    ]
                }
        return {}

    result = await executor.execute(
        request=req,
        llm=llm,
        trace_id="trace_replan",
        user_id="user_3",
        tool_handler=mock_handler,
    )

    assert result.status == AgentExecutionStatus.COMPLETED
    assert workout_queries == [7, 14]
    assert len(result.observations) == 2
    assert result.observations[0].is_empty is True
    assert result.observations[1].is_empty is False


@pytest.mark.asyncio
async def test_workflow_bounded_replanning_limit() -> None:
    llm = MockLlm()
    # Configure budget allowing at most 1 replan
    budget = AgentBudgetConfig(max_replanning_attempts=1)
    executor = LangGraphAgentExecutor(budget=budget)
    req = _mock_request("Check workout history")

    workout_queries = []

    async def mock_handler(name, args):
        if name == "get_recent_workouts":
            workout_queries.append(args.get("days"))
            # Always return empty
            return {"workouts": []}
        return {}

    result = await executor.execute(
        request=req,
        llm=llm,
        trace_id="trace_replan_bound",
        user_id="user_4",
        tool_handler=mock_handler,
    )

    # First query (7 days) + exactly one replan (14 days) = 2 calls total
    assert len(workout_queries) == 2
    assert result.status == AgentExecutionStatus.COMPLETED


@pytest.mark.asyncio
async def test_workflow_tool_call_budget_enforcement() -> None:
    llm = MockLlm()
    # Hard limit of 1 tool call
    budget = AgentBudgetConfig(max_tool_calls=1)
    executor = LangGraphAgentExecutor(budget=budget)
    req = _mock_request("Review my workouts and diet and weight")

    call_count = 0

    async def mock_handler(name, args):
        nonlocal call_count
        call_count += 1
        return {"data": "ok"}

    result = await executor.execute(
        request=req,
        llm=llm,
        trace_id="trace_budget",
        user_id="user_5",
        tool_handler=mock_handler,
    )

    assert call_count == 1
    assert result.status in (AgentExecutionStatus.COMPLETED, AgentExecutionStatus.BUDGET_EXCEEDED)


@pytest.mark.asyncio
async def test_workflow_deadline_protection() -> None:
    llm = MockLlm()
    current_time = 100.0

    def mock_clock():
        return current_time

    # Request has 1000ms deadline
    req = _mock_request("Check progress", deadline_ms=1000)
    budget = AgentBudgetConfig(deadline_margin_s=1.0)
    executor = LangGraphAgentExecutor(budget=budget, clock=mock_clock)

    async def mock_handler(name, args):
        nonlocal current_time
        # Simulate time passing beyond deadline margin
        current_time += 0.8
        return {"workouts": []}

    result = await executor.execute(
        request=req,
        llm=llm,
        trace_id="trace_deadline",
        user_id="user_6",
        tool_handler=mock_handler,
    )

    assert result.status == AgentExecutionStatus.DEADLINE_EXCEEDED
    assert result.termination_reason == AgentTerminationReason.DEADLINE_APPROACHING


@pytest.mark.asyncio
async def test_workflow_node_failure_partial_synthesis() -> None:
    llm = MockLlm()
    executor = LangGraphAgentExecutor()
    req = _mock_request("Check my workouts and nutrition")

    async def mock_handler(name, args):
        if name == "get_recent_workouts":
            raise RuntimeError("Database connection timed out")
        elif name == "get_nutrition_summary":
            return {"avgCalories": 2200, "avgProtein": 150}
        return {}

    result = await executor.execute(
        request=req,
        llm=llm,
        trace_id="trace_partial",
        user_id="user_7",
        tool_handler=mock_handler,
    )

    assert result.status == AgentExecutionStatus.COMPLETED
    # One observation failed, one succeeded
    err_obs = next((o for o in result.observations if o.tool_name == "get_recent_workouts"), None)
    ok_obs = next((o for o in result.observations if o.tool_name == "get_nutrition_summary"), None)
    assert err_obs is not None and err_obs.has_error is True
    assert ok_obs is not None and ok_obs.has_error is False


@pytest.mark.asyncio
async def test_workflow_fallback_to_native_agent(monkeypatch) -> None:
    llm = MockLlm()

    class FaultyGraph:
        async def ainvoke(self, *args, **kwargs):
            raise RuntimeError("LangGraph runtime panic")

    executor = LangGraphAgentExecutor(graph=FaultyGraph(), enable_fallback=True)
    req = _mock_request("Check my fitness progress")

    async def mock_handler(name, args):
        return {"workouts": [{"name": "Chest", "durationMinutes": 30, "volumeKg": 2000}]}

    result = await executor.execute(
        request=req,
        llm=llm,
        trace_id="trace_fallback",
        user_id="user_8",
        tool_handler=mock_handler,
    )

    # Should succeed via fallback to native AgentExecutor
    assert result.status == AgentExecutionStatus.COMPLETED
    assert len(result.observations) >= 1


@pytest.mark.asyncio
async def test_workflow_duplicate_action_prevention() -> None:
    llm = MockLlm()
    executor = LangGraphAgentExecutor()
    req = _mock_request("Check my workouts")

    call_count = 0

    async def mock_handler(name, args):
        nonlocal call_count
        call_count += 1
        return {"workouts": [{"name": "Running", "durationMinutes": 25}]}

    result = await executor.execute(
        request=req,
        llm=llm,
        trace_id="trace_dedup",
        user_id="user_9",
        tool_handler=mock_handler,
    )

    assert call_count == 1
    assert result.status == AgentExecutionStatus.COMPLETED


@pytest.mark.asyncio
async def test_workflow_tamil_and_tanglish_queries() -> None:
    llm = MockLlm()
    executor = LangGraphAgentExecutor()

    # Tamil query
    req_ta = _mock_request("கடந்த வார உடற்பயிற்சி வரலாறு எப்படி உள்ளது?")

    async def mock_handler(name, args):
        return {"workouts": [{"name": "உடற்பயிற்சி", "durationMinutes": 40, "volumeKg": 3000}]}

    res_ta = await executor.execute(
        request=req_ta,
        llm=llm,
        trace_id="trace_ta",
        user_id="user_ta",
        tool_handler=mock_handler,
    )
    assert res_ta.goal.language == "ta"
    assert res_ta.status == AgentExecutionStatus.COMPLETED
    assert "LANGUAGE INSTRUCTION: The user is speaking Tamil." in llm.last_prompt

    # Tanglish query
    req_tl = _mock_request("Enoda workout history check panni sollu coach")
    res_tl = await executor.execute(
        request=req_tl,
        llm=llm,
        trace_id="trace_tl",
        user_id="user_tl",
        tool_handler=mock_handler,
    )
    assert res_tl.goal.language == "tanglish"
    assert res_tl.status == AgentExecutionStatus.COMPLETED
    assert "LANGUAGE INSTRUCTION: The user is speaking Tanglish" in llm.last_prompt
