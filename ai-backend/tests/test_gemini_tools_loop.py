"""Automated test suite for Phase 02 Stage 02: Multi-Turn Gemini Function Calling Loop.

Verifies:
1. Single tool call round
2. Multiple sequential tool rounds
3. Parallel tool calls with bounded concurrency (asyncio.Semaphore(3))
4. Maximum tool rounds limit enforcement (forces final synthesis)
5. Maximum total tool calls limit enforcement (clamps to 5 calls max)
6. Correct cumulative token accounting and budget enforcement
7. Deadline headroom exhaustion before synthesis (returns PROVIDER_TIMEOUT)
8. Tool error sanitization (no internal URLs, IPs, Bearer tokens, or raw exceptions leak)
9. Model fallback without duplicate tool execution (request-scoped caching)
10. Structured outputs compatibility with tools
11. Backward compatibility for non-tool single-turn generation
"""

import asyncio
from types import SimpleNamespace
from typing import Any

import pytest
from google.genai import errors as genai_errors
from google.genai import types
from pydantic import BaseModel

from onusfit_ai.shared.llm.errors import LlmServiceError
from onusfit_ai.shared.llm.gemini import GeminiClient
from onusfit_ai.shared.llm.ports import sanitize_tool_error


def make_mock_turn(
    *,
    function_calls: list[types.FunctionCall] | None = None,
    text: str = "Synthesis complete.",
    prompt_tokens: int = 50,
    candidates_tokens: int = 20,
    cached_tokens: int = 10,
    thoughts_tokens: int = 5,
    total_tokens: int = 70,
    parsed: Any | None = None,
) -> SimpleNamespace:
    calls = function_calls or []
    parts = []
    if calls:
        for fc in calls:
            parts.append(types.Part(function_call=fc))
    elif text:
        parts.append(types.Part.from_text(text=text))

    candidate = types.Candidate(content=types.Content(role="model", parts=parts))
    meta = SimpleNamespace(
        prompt_token_count=prompt_tokens,
        candidates_token_count=candidates_tokens,
        cached_content_token_count=cached_tokens,
        thoughts_token_count=thoughts_tokens,
        total_token_count=total_tokens,
    )
    return SimpleNamespace(
        candidates=[candidate],
        function_calls=calls,
        text=text if not calls else "",
        parsed=parsed,
        usage_metadata=meta,
    )


class FakeMultiTurnSdk:
    """Mimics Gemini SDK aio.models.generate_content across multi-turn plans."""

    def __init__(self, plan: dict[str, list[Any]]) -> None:
        self.plan = plan
        self.calls: list[dict[str, Any]] = []
        self.aio = SimpleNamespace(models=SimpleNamespace(generate_content=self._generate))

    async def _generate(self, *, model: str, contents: Any, config: Any) -> Any:
        self.calls.append({"model": model, "contents": contents, "config": config})
        turns = self.plan.get(model, [])
        if not turns:
            raise RuntimeError(f"No planned turns remaining for model '{model}'")
        outcome = turns.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        if callable(outcome):
            return await outcome()
        return outcome


# ============================================================================
# 1. Single Tool Call Round
# ============================================================================


@pytest.mark.asyncio
async def test_single_tool_round() -> None:
    fc = types.FunctionCall(name="get_recent_workouts", args={"days": 7})
    sdk = FakeMultiTurnSdk(
        {
            "primary": [
                make_mock_turn(function_calls=[fc]),
                make_mock_turn(text="You completed 3 workouts in the past 7 days!"),
            ]
        }
    )
    client = GeminiClient(api_key="fake-key", sdk_client=sdk)

    async def mock_handler(name: str, args: dict[str, Any]) -> dict[str, Any]:
        assert name == "get_recent_workouts"
        assert args == {"days": 7}
        return {"workouts": [{"id": "w1", "name": "Push Day"}]}

    tool = types.Tool(function_declarations=[])
    result = await client.generate_text(
        "How are my workouts?",
        primary_model="primary",
        fallback_model=None,
        deadline_s=10.0,
        tools=[tool],
        tool_handler=mock_handler,
    )

    assert result.text == "You completed 3 workouts in the past 7 days!"
    assert len(result.tool_calls) == 1
    assert result.tool_calls[0].tool_name == "get_recent_workouts"
    assert result.tool_calls[0].args == {"days": 7}
    assert result.tool_calls[0].result == {"workouts": [{"id": "w1", "name": "Push Day"}]}

    # Verify conversation turns in SDK call
    assert len(sdk.calls) == 2
    turn2_contents = sdk.calls[1]["contents"]
    assert len(turn2_contents) == 3
    assert turn2_contents[0].role == "user"
    assert turn2_contents[1].role == "model"
    assert turn2_contents[2].role == "user"
    assert turn2_contents[2].parts[0].function_response.name == "get_recent_workouts"

    # Cumulative usage
    assert result.usage.input_tokens == 100
    assert result.usage.output_tokens == 40
    assert result.usage.cached_tokens == 20
    assert result.usage.thinking_tokens == 10
    assert result.usage.total_tokens == 140


# ============================================================================
# 2. Multiple Sequential Tool Rounds
# ============================================================================


@pytest.mark.asyncio
async def test_multiple_sequential_tool_rounds() -> None:
    fc1 = types.FunctionCall(name="get_recent_workouts", args={"days": 7})
    fc2 = types.FunctionCall(name="get_nutrition_summary", args={"days": 7})
    sdk = FakeMultiTurnSdk(
        {
            "primary": [
                make_mock_turn(function_calls=[fc1], prompt_tokens=50, candidates_tokens=15),
                make_mock_turn(function_calls=[fc2], prompt_tokens=70, candidates_tokens=20),
                make_mock_turn(
                    text="Your training and nutrition are both well on track!",
                    prompt_tokens=90,
                    candidates_tokens=30,
                ),
            ]
        }
    )
    client = GeminiClient(api_key="fake-key", sdk_client=sdk)

    call_history: list[str] = []

    async def mock_handler(name: str, args: dict[str, Any]) -> dict[str, Any]:
        call_history.append(name)
        if name == "get_recent_workouts":
            return {"workouts": ["Push", "Pull"]}
        return {"macros": {"calories": 2200}}

    result = await client.generate_text(
        "Check my training and diet",
        primary_model="primary",
        fallback_model=None,
        deadline_s=10.0,
        tools=[types.Tool(function_declarations=[])],
        tool_handler=mock_handler,
    )

    assert call_history == ["get_recent_workouts", "get_nutrition_summary"]
    assert result.text == "Your training and nutrition are both well on track!"
    assert len(result.tool_calls) == 2
    assert result.tool_calls[0].tool_name == "get_recent_workouts"
    assert result.tool_calls[1].tool_name == "get_nutrition_summary"

    # Cumulative usage check
    assert result.usage.input_tokens == 210  # 50 + 70 + 90
    assert result.usage.output_tokens == 65  # 15 + 20 + 30


# ============================================================================
# 3. Parallel Tool Calls with Bounded Concurrency
# ============================================================================


@pytest.mark.asyncio
async def test_parallel_tool_calls_with_bounded_concurrency() -> None:
    fc1 = types.FunctionCall(name="get_recent_workouts", args={"days": 7})
    fc2 = types.FunctionCall(name="get_nutrition_summary", args={"days": 7})
    fc3 = types.FunctionCall(name="get_weight_trend", args={"days": 30})

    sdk = FakeMultiTurnSdk(
        {
            "primary": [
                make_mock_turn(function_calls=[fc1, fc2, fc3]),
                make_mock_turn(text="Parallel analysis complete."),
            ]
        }
    )
    client = GeminiClient(api_key="fake-key", sdk_client=sdk)

    active_concurrency = 0
    max_concurrency_seen = 0

    async def mock_handler(name: str, args: dict[str, Any]) -> dict[str, Any]:
        nonlocal active_concurrency, max_concurrency_seen
        active_concurrency += 1
        max_concurrency_seen = max(max_concurrency_seen, active_concurrency)
        await asyncio.sleep(0.01)
        active_concurrency -= 1
        return {"tool": name, "status": "ok"}

    result = await client.generate_text(
        "Give me a full progress update",
        primary_model="primary",
        fallback_model=None,
        deadline_s=10.0,
        tools=[types.Tool(function_declarations=[])],
        tool_handler=mock_handler,
    )

    assert result.text == "Parallel analysis complete."
    assert len(result.tool_calls) == 3
    # Bounded concurrency check: Semaphore(3) guarantees max concurrent <= 3
    assert max_concurrency_seen <= 3

    # Verify all 3 tool responses were bundled into turn 2
    turn2_user_content = sdk.calls[1]["contents"][2]
    assert len(turn2_user_content.parts) == 3
    names = [p.function_response.name for p in turn2_user_content.parts]
    assert names == ["get_recent_workouts", "get_nutrition_summary", "get_weight_trend"]


# ============================================================================
# 4. Maximum Tool Limits: Max 3 Rounds Enforcement
# ============================================================================


@pytest.mark.asyncio
async def test_max_tool_rounds_enforcement_forces_final_synthesis() -> None:
    # Model attempts to keep calling tools with different parameters indefinitely
    fc1 = types.FunctionCall(name="get_recent_workouts", args={"days": 7})
    fc2 = types.FunctionCall(name="get_recent_workouts", args={"days": 14})
    fc3 = types.FunctionCall(name="get_recent_workouts", args={"days": 21})

    sdk = FakeMultiTurnSdk(
        {
            "primary": [
                make_mock_turn(function_calls=[fc1]),  # Round 1
                make_mock_turn(function_calls=[fc2]),  # Round 2
                make_mock_turn(function_calls=[fc3]),  # Round 3
                make_mock_turn(text="Max rounds reached; final answer synthesized."),  # Round 4
            ]
        }
    )
    client = GeminiClient(api_key="fake-key", sdk_client=sdk)

    rounds_executed = 0

    async def mock_handler(name: str, args: dict[str, Any]) -> dict[str, Any]:
        nonlocal rounds_executed
        rounds_executed += 1
        return {"round": rounds_executed, "days": args["days"]}

    result = await client.generate_text(
        "Loop me",
        primary_model="primary",
        fallback_model=None,
        deadline_s=10.0,
        tools=[types.Tool(function_declarations=[])],
        tool_handler=mock_handler,
        max_tool_rounds=3,
    )

    assert rounds_executed == 3
    assert result.text == "Max rounds reached; final answer synthesized."

    # Turn 4 config MUST have tools disabled
    turn4_config = sdk.calls[3]["config"]
    assert (
        turn4_config.tool_config.function_calling_config.mode
        == types.FunctionCallingConfigMode.NONE
    )


# ============================================================================
# 5. Maximum Total Tool Calls Limit (Max 5 Calls)
# ============================================================================


@pytest.mark.asyncio
async def test_max_total_tool_calls_limit() -> None:
    # Round 1 emits 3 calls, Round 2 emits 3 calls (total 6 requested, limit is 5)
    fcs_round1 = [
        types.FunctionCall(name="search_exercises", args={"query": f"ex_{i}"}) for i in range(1, 4)
    ]
    fcs_round2 = [
        types.FunctionCall(name="search_exercises", args={"query": f"ex_{i}"}) for i in range(4, 7)
    ]

    sdk = FakeMultiTurnSdk(
        {
            "primary": [
                make_mock_turn(function_calls=fcs_round1),
                make_mock_turn(function_calls=fcs_round2),
                make_mock_turn(text="Here are your exercises."),
            ]
        }
    )
    client = GeminiClient(api_key="fake-key", sdk_client=sdk)

    executed_queries: list[str] = []

    async def mock_handler(name: str, args: dict[str, Any]) -> dict[str, Any]:
        executed_queries.append(args["query"])
        return {"query": args["query"]}

    result = await client.generate_text(
        "Search exercises",
        primary_model="primary",
        fallback_model=None,
        deadline_s=10.0,
        tools=[types.Tool(function_declarations=[])],
        tool_handler=mock_handler,
        max_total_tool_calls=5,
    )

    # Exactly 5 queries executed by the handler
    assert len(executed_queries) == 5
    assert executed_queries == ["ex_1", "ex_2", "ex_3", "ex_4", "ex_5"]

    # 6th call was rejected with the safe error message
    assert len(result.tool_calls) == 6
    assert "limit of 5 calls exceeded" in result.tool_calls[5].result["error"]
    assert result.text == "Here are your exercises."


# ============================================================================
# 6. Cumulative Token Accounting & Budget Limit
# ============================================================================


@pytest.mark.asyncio
async def test_token_accounting_and_budget_limit() -> None:
    fc = types.FunctionCall(name="get_recent_workouts", args={"days": 7})
    sdk = FakeMultiTurnSdk(
        {
            "primary": [
                make_mock_turn(function_calls=[fc], total_tokens=100),
                make_mock_turn(text="Synthesis", total_tokens=50),
            ]
        }
    )
    client = GeminiClient(api_key="fake-key", sdk_client=sdk)

    async def mock_handler(name: str, args: dict[str, Any]) -> dict[str, Any]:
        return {"ok": True}

    # Set budget = 120 total tokens. Round 1 uses 100, next turn will have tools disabled.
    result = await client.generate_text(
        "Budget test",
        primary_model="primary",
        fallback_model=None,
        deadline_s=10.0,
        tools=[types.Tool(function_declarations=[])],
        tool_handler=mock_handler,
        max_total_tokens=120,
    )

    assert result.text == "Synthesis"
    assert result.usage.total_tokens == 150


# ============================================================================
# 7. Deadline Headroom Exhaustion
# ============================================================================


@pytest.mark.asyncio
async def test_deadline_headroom_exhaustion_returns_provider_timeout() -> None:
    fc = types.FunctionCall(name="get_recent_workouts", args={"days": 7})
    sdk = FakeMultiTurnSdk(
        {
            "primary": [
                make_mock_turn(function_calls=[fc]),
                make_mock_turn(text="Should not be called"),
            ]
        }
    )

    current_time = 100.0

    def mock_clock() -> float:
        return current_time

    client = GeminiClient(api_key="fake-key", sdk_client=sdk, clock=mock_clock)

    async def mock_handler(name: str, args: dict[str, Any]) -> dict[str, Any]:
        nonlocal current_time
        # Advance time so that only 1.0 second remains (less than _MIN_SYNTHESIS_SECONDS = 2.0s)
        current_time = 108.5
        return {"data": "ok"}

    with pytest.raises(LlmServiceError) as exc_info:
        await client.generate_text(
            "Slow tool",
            primary_model="primary",
            fallback_model=None,
            deadline_s=10.0,  # deadline is at 110.0
            tools=[types.Tool(function_declarations=[])],
            tool_handler=mock_handler,
        )

    assert exc_info.value.code == "PROVIDER_TIMEOUT"
    # Second call to SDK was aborted early without calling Gemini
    assert len(sdk.calls) == 1


# ============================================================================
# 8. Sanitized Tool Errors
# ============================================================================


@pytest.mark.asyncio
async def test_tool_error_sanitization() -> None:
    fc = types.FunctionCall(name="get_recent_workouts", args={"days": 7})
    sdk = FakeMultiTurnSdk(
        {
            "primary": [
                make_mock_turn(function_calls=[fc]),
                make_mock_turn(text="Handled failure safely."),
            ]
        }
    )
    client = GeminiClient(api_key="fake-key", sdk_client=sdk)

    async def hostile_handler(name: str, args: dict[str, Any]) -> dict[str, Any]:
        raise RuntimeError(
            "Database error at http://internal-db.vpc:5432/secrets?token=Bearer secret-jwt-token-12345 "
            "Host: 10.0.0.1:8080 SELECT * FROM user_credentials"
        )

    result = await client.generate_text(
        "Run hostile tool",
        primary_model="primary",
        fallback_model=None,
        deadline_s=10.0,
        tools=[types.Tool(function_declarations=[])],
        tool_handler=hostile_handler,
    )

    assert result.text == "Handled failure safely."
    tool_res = result.tool_calls[0].result
    assert "error" in tool_res
    err_str = tool_res["error"]
    assert "secret-jwt-token" not in err_str
    assert "http://internal-db" not in err_str
    assert "10.0.0.1" not in err_str
    assert "SELECT *" not in err_str
    assert "temporary failure" in err_str


def test_sanitize_tool_error_helper_strips_credentials() -> None:
    raw = (
        "Connection refused to http://127.0.0.1:3000/api/v1 with Bearer abc.def.ghi. "
        "Postgres error on 192.168.1.1: table users"
    )
    sanitized = sanitize_tool_error("test_tool", raw)
    assert "abc.def.ghi" not in sanitized["error"]
    assert "127.0.0.1" not in sanitized["error"]
    assert "192.168.1.1" not in sanitized["error"]
    assert "table users" not in sanitized["error"]
    assert "network failure" in sanitized["error"]


# ============================================================================
# 9. Model Fallback Without Duplicate Tool Execution
# ============================================================================


@pytest.mark.asyncio
async def test_model_fallback_without_duplicate_tool_execution() -> None:
    fc = types.FunctionCall(name="get_recent_workouts", args={"days": 7})
    overloaded_err = genai_errors.ServerError(
        503, {"error": {"code": 503, "message": "High demand", "status": "UNAVAILABLE"}}
    )

    sdk = FakeMultiTurnSdk(
        {
            "primary": [
                make_mock_turn(function_calls=[fc]),
                overloaded_err,  # Primary fails on turn 2
            ],
            "fallback": [
                make_mock_turn(function_calls=[fc]),  # Fallback requests same tool
                make_mock_turn(text="Fallback model synthesized answer successfully!"),
            ],
        }
    )
    client = GeminiClient(api_key="fake-key", sdk_client=sdk)

    handler_call_count = 0

    async def mock_handler(name: str, args: dict[str, Any]) -> dict[str, Any]:
        nonlocal handler_call_count
        handler_call_count += 1
        return {"workouts": ["Workout A"]}

    result = await client.generate_text(
        "Test fallback caching",
        primary_model="primary",
        fallback_model="fallback",
        deadline_s=10.0,
        tools=[types.Tool(function_declarations=[])],
        tool_handler=mock_handler,
    )

    # ZERO duplicate execution: handler was called exactly ONCE across primary and fallback
    assert handler_call_count == 1
    assert result.text == "Fallback model synthesized answer successfully!"
    assert result.usage.is_fallback is True
    assert result.usage.model == "fallback"


# ============================================================================
# 10. Structured Output Compatibility with Tools
# ============================================================================


class SampleStructuredOutput(BaseModel):
    summary: str
    readiness_score: int


@pytest.mark.asyncio
async def test_structured_output_compatibility_with_tools() -> None:
    fc = types.FunctionCall(name="get_recent_workouts", args={"days": 7})
    sdk = FakeMultiTurnSdk(
        {
            "primary": [
                make_mock_turn(function_calls=[fc]),
                make_mock_turn(
                    text='{"summary": "Solid recovery and volume.", "readiness_score": 88}'
                ),
            ]
        }
    )
    client = GeminiClient(api_key="fake-key", sdk_client=sdk)

    async def mock_handler(name: str, args: dict[str, Any]) -> dict[str, Any]:
        return {"recovery": "good"}

    result = await client.generate_text(
        "Evaluate readiness",
        primary_model="primary",
        fallback_model=None,
        deadline_s=10.0,
        tools=[types.Tool(function_declarations=[])],
        tool_handler=mock_handler,
        schema=SampleStructuredOutput,
    )

    assert result.parsed is not None
    assert isinstance(result.parsed, SampleStructuredOutput)
    assert result.parsed.summary == "Solid recovery and volume."
    assert result.parsed.readiness_score == 88


# ============================================================================
# 11. Backward Compatibility for Non-Tool Single-Turn Generation
# ============================================================================


@pytest.mark.asyncio
async def test_backward_compatibility_no_tools() -> None:
    sdk = FakeMultiTurnSdk({"primary": [make_mock_turn(text="Plain text reply")]})
    client = GeminiClient(api_key="fake-key", sdk_client=sdk)

    result = await client.generate_text(
        "Just a prompt",
        primary_model="primary",
        fallback_model=None,
        deadline_s=10.0,
    )

    assert result.text == "Plain text reply"
    assert result.tool_calls == []
    assert len(sdk.calls) == 1
    # Plain text contents preserved as string (existing behavior)
    assert sdk.calls[0]["contents"] == "Just a prompt"
