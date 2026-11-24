"""Unit tests for AgentToolOrchestrator and concurrent execution."""

import pytest

from onusfit_ai.features.mcp.application.orchestrator import AgentToolOrchestrator
from onusfit_ai.features.mcp.application.registry import create_fitonus_tool_registry
from onusfit_ai.features.mcp.domain.contracts import McpToolCall
from onusfit_ai.features.mcp.domain.errors import McpSecurityError


@pytest.mark.asyncio
async def test_orchestrator_dynamic_discovery() -> None:
    registry = create_fitonus_tool_registry()
    orchestrator = AgentToolOrchestrator(registry=registry)

    all_tools = orchestrator.discover_tools()
    assert len(all_tools) >= 10

    read_only_tools = orchestrator.discover_tools(filter_read_only=True)
    # persist_workout_plan is write, so it must not be in read_only_tools
    names = {t.name for t in read_only_tools}
    assert "persist_workout_plan" not in names
    assert "preview_workout_plan" in names


@pytest.mark.asyncio
async def test_orchestrator_parallel_read_only_execution() -> None:
    registry = create_fitonus_tool_registry()
    orchestrator = AgentToolOrchestrator(registry=registry)

    calls = [
        McpToolCall(
            tool_name="get_fitness_profile",
            arguments={},
            user_id="user-parallel",
            request_id="req-p1",
        ),
        McpToolCall(
            tool_name="preview_nutrition_plan",
            arguments={"goal": "fat_loss", "weight_kg": 75.0},
            user_id="user-parallel",
            request_id="req-p2",
        ),
        McpToolCall(
            tool_name="validate_workout_plan",
            arguments={"plan": {"sessions": []}},
            user_id="user-parallel",
            request_id="req-p3",
        ),
    ]

    results = await orchestrator.execute_parallel_reads(calls)
    assert len(results) == 3
    assert all(not r.is_error for r in results)
    assert results[0].tool_name == "get_fitness_profile"
    assert results[1].tool_name == "preview_nutrition_plan"
    assert results[2].tool_name == "validate_workout_plan"


@pytest.mark.asyncio
async def test_orchestrator_blocks_write_tools_in_parallel_execution() -> None:
    registry = create_fitonus_tool_registry()
    orchestrator = AgentToolOrchestrator(registry=registry)

    calls = [
        McpToolCall(
            tool_name="preview_nutrition_plan",
            arguments={"goal": "fat_loss"},
            user_id="user-1",
            request_id="req-1",
        ),
        McpToolCall(
            tool_name="persist_workout_plan",  # Mutating write tool!
            arguments={"plan": {}, "name": "Test"},
            user_id="user-1",
            request_id="req-2",
        ),
    ]

    with pytest.raises(McpSecurityError) as exc_info:
        await orchestrator.execute_parallel_reads(calls)
    assert "mutating write operation" in str(exc_info.value)
