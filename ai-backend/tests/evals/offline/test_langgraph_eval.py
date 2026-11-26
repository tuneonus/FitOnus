"""Offline evaluation tests for LangGraph agent workflows across 32 golden benchmark cases.

FitOnus Phase 10: LangGraph Agent Workflows — Stage 08.
Validates:
- Graph execution and state transitions.
- Conditional routing.
- Parallel tools.
- Replanning.
- Budget exhaustion.
- Deadline handling.
- Node failures.
- Fallback behavior.
- Duplicate execution prevention.
- User isolation.
- Tamil/Tanglish queries.
- Native agent versus LangGraph behavioral parity.
"""

import json
import sys
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import pytest
from tests.evals.evaluators.langgraph import LangGraphWorkflowEvaluator

from onusfit_ai.features.coach.application.agent.graph.executor import (
    LangGraphAgentExecutor,
)
from onusfit_ai.features.coach.domain.agent import AgentBudgetConfig
from onusfit_ai.features.coach.domain.chat import (
    CoachChatRequest,
    TodayNutritionContext,
    UserFitnessContext,
    UserFitnessProfile,
)
from onusfit_ai.shared.contracts.common import ModelSelection
from onusfit_ai.shared.llm.ports import LlmResult, LlmUsage, TextGenerator


class MockOfflineLlm(TextGenerator):
    async def generate_text(self, prompt: str, *args, **kwargs) -> LlmResult:
        reply = {
            "text": "Evaluated offline response grounded in verified observations.",
            "follow_ups": ["Next exercise", "Improve routine"],
            "sources": ["Workouts", "Nutrition", "Profile"],
            "medical_note": False,
        }
        return LlmResult(
            text=json.dumps(reply),
            usage=LlmUsage(
                model="offline-mock-gemini",
                is_fallback=False,
                input_tokens=100,
                output_tokens=50,
                cached_tokens=0,
                thinking_tokens=0,
                total_tokens=150,
                duration_ms=50,
            ),
        )


def _load_benchmark_cases() -> list[dict[str, Any]]:
    path = Path(__file__).resolve().parent.parent / "datasets" / "langgraph_benchmark.json"
    with open(path, encoding="utf-8") as f:
        return json.load(f)


async def _run_benchmark_case(
    case: dict[str, Any],
    evaluator: LangGraphWorkflowEvaluator,
    llm: TextGenerator,
) -> tuple[bool, list[str]]:
    case_id = case["case_id"]
    msg = case["user_message"]
    deadline_ms = case.get("deadline_ms", 15000)

    # Budget override if specified
    budget = None
    if "override_budget" in case:
        budget = AgentBudgetConfig(**case["override_budget"])

    # Tool mock preparation
    tool_counts: dict[str, int] = {}
    mock_tools = case.get("mock_tools", {})
    mock_seq = case.get("mock_tools_sequence", {})
    mock_error = case.get("mock_tool_error", {})

    async def _tool_handler(name: str, args: dict[str, Any]) -> dict[str, Any]:
        count = tool_counts.get(name, 0)
        tool_counts[name] = count + 1

        if name in mock_error:
            raise RuntimeError(mock_error[name])

        if name in mock_seq:
            seq = mock_seq[name]
            idx = min(count, len(seq) - 1)
            return seq[idx]

        if name in mock_tools:
            return mock_tools[name]

        return {}

    # Handle graph panic simulation
    graph_override = None
    if case.get("force_graph_panic"):

        class CrashingGraph:
            async def ainvoke(self, *a, **kw):
                raise RuntimeError("Simulated graph crash")

        graph_override = CrashingGraph()

    clock_offset = 0.0
    if case.get("facet") == "deadline_handling":

        def clock_fn() -> float:
            nonlocal clock_offset
            clock_offset += 2.0
            return 100.0 + clock_offset
    else:

        def clock_fn() -> float:
            return 100.0

    executor = LangGraphAgentExecutor(
        budget=budget,
        graph=graph_override,
        clock=clock_fn,
        enable_fallback=True,
    )

    req = CoachChatRequest(
        message=msg,
        context=UserFitnessContext(
            profile=UserFitnessProfile(
                display_name="Benchmark User",
                current_weight_kg=75.0,
                target_weight_kg=70.0,
            ),
            today_nutrition=TodayNutritionContext(
                calories_consumed=2000,
                protein_grams=140,
                carbs_grams=200,
                fat_grams=60,
                water_intake_ml=2500,
            ),
            recent_workouts=[],
            active_goals=[],
        ),
        model=ModelSelection(primary="gemini-2.5-flash", fallback="gemini-2.5-flash-lite"),
        deadline_ms=deadline_ms,
    )

    result = await executor.execute(
        request=req,
        llm=llm,
        trace_id=case.get("trace_id", f"trace_{case_id}"),
        user_id=case.get("user_id", "user_bench"),
        tool_handler=_tool_handler if not case.get("is_bypass") else None,
    )

    candidate = {
        "status": str(result.status),
        "termination_reason": str(result.termination_reason),
        "tool_calls": [tc.tool_name for tc in result.tool_calls],
        "goal": {
            "language": result.goal.language,
            "goal_type": str(result.goal.goal_type),
        },
    }

    eval_res = evaluator.evaluate(
        candidate=candidate,
        expected_status=case.get("expected_status"),
        expected_termination_reason=case.get("expected_termination_reason"),
        expected_tools=case.get("expected_tools"),
        expected_language=case.get("expected_language"),
        max_tool_calls=case.get("max_tool_calls"),
        is_bypass=case.get("is_bypass"),
    )

    return eval_res.passed, [f"[{case_id}] {r}" for r in eval_res.failure_reasons]


@pytest.mark.asyncio
async def test_all_langgraph_offline_benchmark_cases() -> None:
    cases = _load_benchmark_cases()
    assert len(cases) >= 30, f"Expected at least 30 benchmark cases, found {len(cases)}"

    evaluator = LangGraphWorkflowEvaluator()
    llm = MockOfflineLlm()

    passed_count = 0
    failed_details = []

    for case in cases:
        passed, reasons = await _run_benchmark_case(case, evaluator, llm)
        if passed:
            passed_count += 1
        else:
            failed_details.extend(reasons)

    assert len(failed_details) == 0, f"Benchmark failures: {failed_details}"
    assert passed_count == len(cases) == 32
