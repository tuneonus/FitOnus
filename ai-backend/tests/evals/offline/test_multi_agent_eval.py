"""Offline & compiled LangGraph benchmark evaluation for Phase 13 Multi-Agent Systems."""

import sys
from pathlib import Path
from typing import Any

import pytest

_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from tests.conftest import FakeLlm
from tests.evals.datasets.loader import load_benchmark_dataset
from tests.evals.evaluators.multi_agent import MultiAgentEvaluator
from tests.evals.runner import run_offline_evaluation

from onusfit_ai.features.coach.application.multi_agent import MultiAgentCoachExecutor
from onusfit_ai.features.coach.domain.chat import CoachChatRequest, UserFitnessContext
from onusfit_ai.features.coach.domain.multi_agent import (
    AgentRole,
    MultiAgentExecutionBudget,
    MultiAgentTerminationReason,
    MultiAgentWorkflowStatus,
)
from onusfit_ai.features.mcp.application.a2a import A2AMediator
from onusfit_ai.shared.contracts.common import ModelSelection


def test_multi_agent_dataset_has_at_least_40_cases_and_passes_all() -> None:
    cases = load_benchmark_dataset("multi_agent")
    assert len(cases) >= 40, f"Expected >= 40 multi-agent benchmark cases, got {len(cases)}"

    evaluator = MultiAgentEvaluator()
    for case in cases:
        assert case.offline_candidate is not None
        res = evaluator.evaluate(
            case.offline_candidate,
            expected_tools=case.expected_tools,
            expected_outcome=case.expected_outcome,
            expected_safety_disclaimers=case.expected_safety_disclaimers,
            forbidden_terms=case.forbidden_terms,
            input_payload=case.input_payload,
        )
        assert res.passed, f"{case.case_id} failed: {res.failure_reasons}"

    runner_results = run_offline_evaluation("multi_agent")
    assert len(runner_results) == len(cases)
    assert all(r["passed"] for r in runner_results)


@pytest.mark.asyncio
async def test_compiled_langgraph_multi_agent_benchmark_scenarios() -> None:
    """Execute actual compiled LangGraph multi-agent graph over core scenarios."""
    llm = FakeLlm()
    executor = MultiAgentCoachExecutor(
        budget=MultiAgentExecutionBudget(),
        a2a_mediator_factory=A2AMediator,
    )

    async def _tools(name: str, _args: dict[str, Any]) -> dict[str, Any]:
        if name == "get_recent_workouts":
            return {"workouts": [{"name": "Full Body", "totalVolumeKg": 2500}]}
        if name == "get_nutrition_summary":
            return {"days": [{"calories": 2000, "proteinG": 130}]}
        if name == "get_weight_trend":
            return {"logs": [{"weightKg": 74.0}, {"weightKg": 73.5}]}
        return {"ok": True}

    def _req(msg: str) -> CoachChatRequest:
        return CoachChatRequest(
            message=msg,
            model=ModelSelection(primary="gemini-3.5-flash-lite", fallback="gemini-3.1-flash-lite"),
            deadline_ms=20000,
            context=UserFitnessContext.model_validate(
                {
                    "profile": {
                        "display_name": "Dev",
                        "primary_goal": "muscle_building",
                        "experience_level": "intermediate",
                    },
                    "today_nutrition": {
                        "calories_consumed": 1200,
                        "protein_grams": 80,
                        "carbs_grams": 140,
                        "fat_grams": 35,
                        "water_intake_ml": 1500,
                    },
                    "recent_workouts": [],
                    "active_goals": [],
                }
            ),
            memories=[],
        )

    prompts_and_expectations = [
        ("Hi coach", MultiAgentWorkflowStatus.BYPASSED, set()),
        (
            "Create a workout plan based on my recent progress",
            MultiAgentWorkflowStatus.COMPLETED,
            {AgentRole.PROGRESS, AgentRole.WORKOUT},
        ),
        (
            "Analyze my workout and nutrition consistency",
            MultiAgentWorkflowStatus.COMPLETED,
            {AgentRole.WORKOUT, AgentRole.NUTRITION},
        ),
        (
            "Adjust my training based on recovery feedback",
            MultiAgentWorkflowStatus.COMPLETED,
            {AgentRole.RECOVERY, AgentRole.WORKOUT},
        ),
        (
            "Review my weekly fitness progress",
            MultiAgentWorkflowStatus.COMPLETED,
            {AgentRole.PROGRESS},
        ),
        (
            "Recommend a balanced fitness routine",
            MultiAgentWorkflowStatus.COMPLETED,
            {AgentRole.WORKOUT, AgentRole.NUTRITION, AgentRole.RECOVERY},
        ),
    ]

    for prompt, expected_status, expected_roles in prompts_and_expectations:
        out = await executor.execute(
            _req(prompt),
            llm,
            trace_id="eval-trace",
            user_id="eval-user",
            mcp_handler=_tools,
        )
        assert out.status == expected_status
        actual_roles = {r.agent_role for r in out.agent_results}
        assert expected_roles.issubset(actual_roles)
        assert out.termination_reason != MultiAgentTerminationReason.UNEXPECTED_ERROR
