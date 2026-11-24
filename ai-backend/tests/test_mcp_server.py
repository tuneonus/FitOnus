"""Unit tests for FitOnus MCPServer builder and lifecycle management."""

import json

import pytest

from onusfit_ai.features.mcp.domain.contracts import McpConfig
from onusfit_ai.features.mcp.presentation.server.builder import (
    FitOnusMcpServer,
    current_request_id,
    current_user_id,
    reset_fitonus_mcp_server,
)


@pytest.fixture(autouse=True)
def clean_server_singleton() -> None:
    reset_fitonus_mcp_server()
    yield
    reset_fitonus_mcp_server()


@pytest.mark.asyncio
async def test_mcp_server_initialization_and_tool_registration() -> None:
    server = FitOnusMcpServer(config=McpConfig())
    registry = server.get_registry()

    # Verify all 10 tools registered
    tools = registry.list_tools()
    assert len(tools) >= 10
    tool_names = {t.name for t in tools}
    assert "get_fitness_profile" in tool_names
    assert "get_recent_workouts" in tool_names
    assert "search_exercises" in tool_names
    assert "get_exercise_details" in tool_names
    assert "preview_workout_plan" in tool_names
    assert "validate_workout_plan" in tool_names
    assert "persist_workout_plan" in tool_names
    assert "get_nutrition_summary" in tool_names
    assert "preview_nutrition_plan" in tool_names
    assert "get_weight_trend" in tool_names

    # Check resources
    resources = registry.list_resources()
    assert len(resources) == 3
    uris = {r.uri for r in resources}
    assert "fitonus://catalog/exercises" in uris
    assert "fitonus://knowledge/guidelines" in uris
    assert "fitonus://planning/guidelines" in uris

    # Check prompts
    prompts = registry.list_prompts()
    assert len(prompts) >= 2
    prompt_names = {p.name for p in prompts}
    assert "fitness_progress_analysis" in prompt_names
    assert "workout_planning" in prompt_names


@pytest.mark.asyncio
async def test_mcp_server_in_process_tool_execution() -> None:
    server = FitOnusMcpServer()

    # 1. Test preview_nutrition_plan
    result = await server.call_tool_in_process(
        name="preview_nutrition_plan",
        arguments={"goal": "muscle_building", "weight_kg": 80.0},
        user_id="test-athlete",
        request_id="req-mcp-1",
    )
    assert result.is_error is False
    assert result.structured_data["nutrition_plan"]["goal"] == "muscle_building"
    assert result.structured_data["nutrition_plan"]["protein_g"] == 160

    # 2. Test validate_workout_plan with valid plan
    valid_res = await server.call_tool_in_process(
        name="validate_workout_plan",
        arguments={
            "plan": {
                "sessions": [
                    {
                        "day_name": "Monday",
                        "exercises": [{"name": "Squat"}, {"name": "Bench Press"}],
                    }
                ]
            }
        },
        user_id="test-athlete",
        request_id="req-mcp-2",
    )
    assert valid_res.is_error is False
    assert valid_res.structured_data["is_valid"] is True

    # 3. Test validate_workout_plan with duplicate exercises
    dup_res = await server.call_tool_in_process(
        name="validate_workout_plan",
        arguments={
            "plan": {
                "sessions": [
                    {
                        "day_name": "Monday",
                        "exercises": [{"name": "Squat"}, {"name": "Squat"}],
                    }
                ]
            }
        },
        user_id="test-athlete",
        request_id="req-mcp-3",
    )
    assert dup_res.is_error is False
    assert dup_res.structured_data["is_valid"] is False
    assert any("duplicate" in v for v in dup_res.structured_data["violations"])


@pytest.mark.asyncio
async def test_mcp_server_request_context_propagation() -> None:
    server = FitOnusMcpServer()

    tokens = server.bind_request_context("user-context-42", "req-correlation-99")
    try:
        assert current_user_id.get() == "user-context-42"
        assert current_request_id.get() == "req-correlation-99"

        # get_fitness_profile uses current_user_id
        res = await server.call_tool_in_process(
            name="get_fitness_profile",
            arguments={},
            user_id="user-context-42",
            request_id="req-correlation-99",
        )
        assert res.is_error is False
        assert res.structured_data["profile"]["userId"] == "user-context-42"
    finally:
        server.reset_request_context(tokens)

    # After reset
    assert current_user_id.get() == "authenticated_user"


@pytest.mark.asyncio
async def test_mcp_server_resource_reading() -> None:
    server = FitOnusMcpServer()
    registry = server.get_registry()

    content = await registry.read_resource("fitonus://planning/guidelines")
    assert content is not None
    data = json.loads(content.text)
    assert "weekly_frequency_limits" in data
    assert data["weekly_frequency_limits"]["min_days"] == 2


@pytest.mark.asyncio
async def test_mcp_server_prompt_rendering() -> None:
    server = FitOnusMcpServer()
    registry = server.get_registry()

    rendered = registry.render_prompt(
        "fitness_progress_analysis",
        athlete_goal="hypertrophy",
        time_window_days=14,
    )
    assert rendered is not None
    assert rendered.name == "fitness_progress_analysis"
    assert "hypertrophy" in rendered.messages[0].content
    assert "14" in rendered.messages[0].content
