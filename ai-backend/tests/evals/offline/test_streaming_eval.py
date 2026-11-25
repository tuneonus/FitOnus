"""Offline & compiled agent streaming evaluation suite for FitOnus Phase 14."""

import json
import sys
from pathlib import Path
from typing import Any

import pytest

_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from tests.conftest import FakeLlm
from tests.evals.evaluators.streaming import StreamingEvaluator
from tests.evals.schemas import BenchmarkCase

from onusfit_ai.features.coach.application.agent_streaming import (
    stream_langgraph_agent,
    stream_multi_agent,
)
from onusfit_ai.features.coach.domain.chat import CoachChatRequest, UserFitnessContext
from onusfit_ai.features.mcp.application.a2a import A2AMediator
from onusfit_ai.shared.contracts.common import ModelSelection
from onusfit_ai.shared.contracts.streaming import StreamDeltaEvent, StreamStatusEvent

_DATASET_PATH = Path(__file__).resolve().parent.parent / "datasets" / "streaming_benchmark.json"


def _sample_request(message: str = "How were my workouts?") -> CoachChatRequest:
    return CoachChatRequest(
        message=message,
        context=UserFitnessContext.model_validate(
            {
                "profile": {
                    "displayName": "Kavi",
                    "age": 27,
                    "sex": "male",
                    "primaryGoal": "strength",
                },
                "todayNutrition": {
                    "caloriesConsumed": 1750,
                    "proteinGrams": 130,
                    "carbsGrams": 180,
                    "fatGrams": 55,
                    "waterIntakeMl": 2200,
                    "calorieTarget": 2200,
                    "proteinTarget": 150,
                },
                "recentWorkouts": [],
                "todayPlannedWorkout": None,
                "activeGoals": [],
                "latestWeightKg": 74.0,
            }
        ),
        model=ModelSelection(primary="gemini-3.5-flash-lite", fallback="gemini-3.1-flash-lite"),
        deadline_ms=10_000,
    )


def test_streaming_benchmark_dataset_passes_all_cases() -> None:
    raw_items: list[dict[str, Any]] = json.loads(_DATASET_PATH.read_text(encoding="utf-8"))
    cases = [BenchmarkCase.model_validate(item) for item in raw_items]
    assert len(cases) >= 16

    evaluator = StreamingEvaluator()
    for case in cases:
        assert case.offline_candidate is not None
        result = evaluator.evaluate(
            case.offline_candidate,
            expected_tools=case.expected_tools,
            expected_outcome=case.expected_outcome,
            expected_safety_disclaimers=case.expected_safety_disclaimers,
            forbidden_terms=case.forbidden_terms,
            input_payload=case.input_payload,
        )
        assert result.passed, f"{case.case_id} failed: {result.failure_reasons}"


@pytest.mark.asyncio
async def test_live_compiled_langgraph_and_multi_agent_streaming_evals() -> None:
    llm = FakeLlm(stream_chunks=["Inniku workout ", "super consistency! ", "Keep hydrating."])
    req = _sample_request("Inniku workout epdi iruku?")

    events_lg: list[StreamStatusEvent | StreamDeltaEvent] = []
    seq = [0]

    async def emit_lg(event: StreamStatusEvent | StreamDeltaEvent) -> None:
        events_lg.append(event)

    async def tool_handler(tool_name: str, _args: dict[str, Any]) -> dict[str, Any]:
        return {"tool": tool_name, "workouts": [{"name": "Push Day", "volumeKg": 2400}]}

    exec_lg = await stream_langgraph_agent(
        request=req,
        llm=llm,
        trace_id="eval-lg-1",
        user_id="user-eval",
        tool_handler=tool_handler,
        emit=emit_lg,
        seq_counter=seq,
    )
    assert exec_lg.response.text == "Inniku workout super consistency! Keep hydrating."
    assert any(e.type == "delta" for e in events_lg)
    assert all(
        "<thought>" not in e.message and "user-eval" not in e.message
        for e in events_lg
        if e.type == "status"
    )

    events_ma: list[StreamStatusEvent | StreamDeltaEvent] = []
    seq_ma = [0]

    async def emit_ma(event: StreamStatusEvent | StreamDeltaEvent) -> None:
        events_ma.append(event)

    llm_ma = FakeLlm(stream_chunks=["Rest today and stretch gently."])
    res_ma, _usage_ma, _partial_ma = await stream_multi_agent(
        request=_sample_request("Plan today workout and recovery nutrition"),
        llm=llm_ma,
        trace_id="eval-ma-1",
        user_id="user-eval",
        tool_handler=tool_handler,
        a2a_mediator=A2AMediator(),
        emit=emit_ma,
        seq_counter=seq_ma,
    )
    assert "Rest today" in res_ma.text
    assert any(e.type == "status" for e in events_ma)
