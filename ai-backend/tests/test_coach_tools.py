"""Unit tests for Phase 02 Stage 01: Gemini Function Calling tools and dispatcher."""

import time

import httpx
import jwt
import pytest
from pydantic import ValidationError

from onusfit_ai.features.coach.application.tools import (
    TOOL_GET_NUTRITION_SUMMARY,
    TOOL_GET_RECENT_WORKOUTS,
    TOOL_GET_WEIGHT_TREND,
    TOOL_JWT_AUDIENCE,
    TOOL_JWT_ISSUER,
    TOOL_JWT_SCOPE,
    TOOL_SEARCH_EXERCISES,
    GetNutritionSummaryArgs,
    GetRecentWorkoutsArgs,
    GetWeightTrendArgs,
    SearchExercisesArgs,
)
from onusfit_ai.shared.auth.auth import mint_internal_tool_token
from onusfit_ai.shared.llm.gemini import get_coach_tool_declarations, get_coach_tools
from onusfit_ai.shared.tools.client import InternalToolsClient

SECRET = "test-jwt-secret-at-least-32-characters-long!"
USER_ID = "11111111-1111-4111-8111-111111111111"
REQUEST_ID = "req-test-uuid"


# ============================================================================
# 1. Pydantic Schema Validation Tests
# ============================================================================


def test_recent_workouts_args_valid_and_bounds() -> None:
    # Default days = 7
    args = GetRecentWorkoutsArgs()
    assert args.days == 7

    # Explicit within range
    args = GetRecentWorkoutsArgs(days=30)
    assert args.days == 30

    # Bounds: ge=1, le=90
    with pytest.raises(ValidationError):
        GetRecentWorkoutsArgs(days=0)
    with pytest.raises(ValidationError):
        GetRecentWorkoutsArgs(days=91)

    # Extra fields forbidden
    with pytest.raises(ValidationError):
        GetRecentWorkoutsArgs.model_validate({"days": 7, "userId": "attacker"})


def test_nutrition_summary_args_valid_and_bounds() -> None:
    # Default days = 7, date = None
    args = GetNutritionSummaryArgs()
    assert args.days == 7
    assert args.date is None

    # Valid date format YYYY-MM-DD
    args = GetNutritionSummaryArgs(date="2026-11-21", days=14)
    assert args.date == "2026-11-21"
    assert args.days == 14

    # Invalid date pattern
    with pytest.raises(ValidationError):
        GetNutritionSummaryArgs(date="invalid-date")

    # Bounds: le=30
    with pytest.raises(ValidationError):
        GetNutritionSummaryArgs(days=31)

    # Extra fields forbidden
    with pytest.raises(ValidationError):
        GetNutritionSummaryArgs.model_validate({"days": 7, "injected": True})


def test_weight_trend_args_valid_and_bounds() -> None:
    # Default days = 30
    args = GetWeightTrendArgs()
    assert args.days == 30

    # Bounds: ge=1, le=90
    with pytest.raises(ValidationError):
        GetWeightTrendArgs(days=0)
    with pytest.raises(ValidationError):
        GetWeightTrendArgs(days=100)


def test_search_exercises_args_valid_and_bounds() -> None:
    args = SearchExercisesArgs(query="bench press", muscle="chest", limit=5)
    assert args.query == "bench press"
    assert args.muscle == "chest"
    assert args.equipment is None
    assert args.limit == 5

    # Query required and min_length=1
    with pytest.raises(ValidationError):
        SearchExercisesArgs(query="")

    # Limit bounds: 1 <= limit <= 10
    with pytest.raises(ValidationError):
        SearchExercisesArgs(query="squat", limit=0)
    with pytest.raises(ValidationError):
        SearchExercisesArgs(query="squat", limit=15)


# ============================================================================
# 2. Gemini Tool Declaration Tests
# ============================================================================


def test_get_coach_tool_declarations_returns_valid_gemini_declarations() -> None:
    declarations = get_coach_tool_declarations()
    assert len(declarations) == 4

    names = {d.name for d in declarations}
    assert names == {
        TOOL_GET_RECENT_WORKOUTS,
        TOOL_GET_NUTRITION_SUMMARY,
        TOOL_GET_WEIGHT_TREND,
        TOOL_SEARCH_EXERCISES,
    }

    for decl in declarations:
        assert decl.description
        assert decl.parameters_json_schema is not None
        assert "properties" in decl.parameters_json_schema


def test_get_coach_tools_returns_gemini_tool_object() -> None:
    tools = get_coach_tools()
    assert len(tools) == 1
    assert len(tools[0].function_declarations) == 4


# ============================================================================
# 3. Service Token Minting Tests
# ============================================================================


def test_mint_internal_tool_token_produces_verifiable_jwt() -> None:
    now = time.time()
    token = mint_internal_tool_token(
        secret=SECRET,
        user_id=USER_ID,
        request_id=REQUEST_ID,
        clock=lambda: now,
    )

    payload = jwt.decode(
        token,
        SECRET,
        algorithms=["HS256"],
        audience=TOOL_JWT_AUDIENCE,
        issuer=TOOL_JWT_ISSUER,
    )

    assert payload["sub"] == USER_ID
    assert payload["scope"] == TOOL_JWT_SCOPE
    assert payload["rid"] == REQUEST_ID
    assert payload["iat"] == int(now)
    assert payload["exp"] == int(now + 30)
    assert "jti" in payload


# ============================================================================
# 4. InternalToolsClient Dispatcher Tests
# ============================================================================


@pytest.mark.asyncio
async def test_dispatcher_rejects_unknown_tool() -> None:
    dispatcher = InternalToolsClient(
        node_api_url="http://node-test",
        service_secret=SECRET,
    )

    result = await dispatcher.execute_tool(
        name="drop_database",
        args={},
        user_id=USER_ID,
        request_id=REQUEST_ID,
    )

    assert "error" in result
    assert "Unknown tool" in result["error"]


@pytest.mark.asyncio
async def test_dispatcher_validates_arguments_before_sending() -> None:
    dispatcher = InternalToolsClient(
        node_api_url="http://node-test",
        service_secret=SECRET,
    )

    result = await dispatcher.execute_tool(
        name=TOOL_GET_RECENT_WORKOUTS,
        args={"days": 999},  # exceeds 90
        user_id=USER_ID,
        request_id=REQUEST_ID,
    )

    assert "error" in result
    assert "Invalid arguments" in result["error"]


@pytest.mark.asyncio
async def test_dispatcher_successful_tool_dispatch() -> None:
    captured_requests: list[httpx.Request] = []

    def mock_transport(request: httpx.Request) -> httpx.Response:
        captured_requests.append(request)
        return httpx.Response(
            200,
            json={
                "data": {
                    "workouts": [{"id": "w1", "name": "Push Day"}],
                    "personalRecords": [],
                },
                "message": "Success",
            },
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(mock_transport))
    dispatcher = InternalToolsClient(
        node_api_url="http://node-test:3000",
        service_secret=SECRET,
        http_client=client,
    )

    result = await dispatcher.execute_tool(
        name=TOOL_GET_RECENT_WORKOUTS,
        args={"days": 7},
        user_id=USER_ID,
        request_id=REQUEST_ID,
    )

    assert len(captured_requests) == 1
    req = captured_requests[0]
    assert req.url == "http://node-test:3000/api/v1/internal/tools/recent-workouts"
    assert req.headers["x-correlation-id"] == REQUEST_ID
    assert req.headers["authorization"].startswith("Bearer ")

    # Verify token payload sent in Authorization header
    token = req.headers["authorization"].split(" ")[1]
    decoded = jwt.decode(token, SECRET, algorithms=["HS256"], audience=TOOL_JWT_AUDIENCE)
    assert decoded["sub"] == USER_ID
    assert decoded["scope"] == TOOL_JWT_SCOPE

    # Result returned correctly
    assert "workouts" in result
    assert result["workouts"][0]["name"] == "Push Day"


@pytest.mark.asyncio
async def test_dispatcher_handles_http_errors() -> None:
    def mock_transport(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "Database error"})

    client = httpx.AsyncClient(transport=httpx.MockTransport(mock_transport))
    dispatcher = InternalToolsClient(
        node_api_url="http://node-test:3000",
        service_secret=SECRET,
        http_client=client,
    )

    result = await dispatcher.execute_tool(
        name=TOOL_SEARCH_EXERCISES,
        args={"query": "pullup"},
        user_id=USER_ID,
        request_id=REQUEST_ID,
    )

    assert "error" in result
    assert "failed with status 500" in result["error"]


@pytest.mark.asyncio
async def test_dispatcher_handles_timeout() -> None:
    def mock_transport(request: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("Connection timed out")

    client = httpx.AsyncClient(transport=httpx.MockTransport(mock_transport))
    dispatcher = InternalToolsClient(
        node_api_url="http://node-test:3000",
        service_secret=SECRET,
        http_client=client,
    )

    result = await dispatcher.execute_tool(
        name=TOOL_GET_WEIGHT_TREND,
        args={"days": 30},
        user_id=USER_ID,
        request_id=REQUEST_ID,
    )

    assert "error" in result
    assert "timed out" in result["error"]
