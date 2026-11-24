"""Unit tests for official FitOnus MCP Client."""

import pytest

from onusfit_ai.features.mcp.presentation.client import FitOnusMcpClient
from onusfit_ai.features.mcp.presentation.server.builder import FitOnusMcpServer


@pytest.mark.asyncio
async def test_mcp_client_connect_and_capability_negotiation() -> None:
    server = FitOnusMcpServer()
    client = FitOnusMcpClient(server=server)

    assert client.is_connected is False
    caps = await client.connect()

    assert client.is_connected is True
    assert caps.supports_tools is True
    assert caps.supports_resources is True
    assert caps.supports_prompts is True
    assert caps.protocol_version == "2024-11-05"

    is_alive = await client.ping()
    assert is_alive is True

    await client.close()
    assert client.is_connected is False


@pytest.mark.asyncio
async def test_mcp_client_tool_discovery_and_invocation() -> None:
    server = FitOnusMcpServer()
    async with FitOnusMcpClient(server=server) as client:
        tools = await client.list_tools()
        assert len(tools) >= 10
        names = {t.name for t in tools}
        assert "get_fitness_profile" in names
        assert "preview_workout_plan" in names

        # Execute tool
        result = await client.call_tool(
            name="preview_workout_plan",
            arguments={"primary_goal": "strength", "days_per_week": 3},
            user_id="athlete-test",
            request_id="req-client-1",
        )
        assert result.is_error is False
        assert result.structured_data["plan"]["days_per_week"] == 3


@pytest.mark.asyncio
async def test_mcp_client_resources_and_prompts() -> None:
    server = FitOnusMcpServer()
    async with FitOnusMcpClient(server=server) as client:
        # Resources
        resources = await client.list_resources()
        assert len(resources) == 3
        content = await client.read_resource("fitonus://knowledge/guidelines")
        assert "progressive_overload" in content.text

        # Prompts
        prompts = await client.list_prompts()
        assert len(prompts) >= 2
        rendered = await client.get_prompt(
            "workout_planning",
            arguments={"target_goal": "hypertrophy", "training_days": 4},
        )
        assert "hypertrophy" in rendered.messages[0].content


@pytest.mark.asyncio
async def test_mcp_client_error_handling_for_unknown_tool() -> None:
    server = FitOnusMcpServer()
    async with FitOnusMcpClient(server=server) as client:
        result = await client.call_tool(
            name="unknown_nonexistent_tool",
            arguments={},
            user_id="user-1",
            request_id="req-err",
        )
        assert result.is_error is True
        assert "not found" in (result.error_message or "").lower()
