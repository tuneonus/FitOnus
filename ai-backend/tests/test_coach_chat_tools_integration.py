"""Stage 03 Integration tests for AI Coach Chat Tool Calling & Observability.

Verifies:
1. Feature flag gating (AI_COACH_CHAT_TOOLS defaults to false).
2. Clean injection of InternalToolsClient via FastAPI dependencies.
3. Anti-confused deputy protection (user identity strictly bound to verified JWT claims.user_id).
4. Tool execution enrichment of result.tool_calls and result.sources.
5. Telemetry emission of toolCallsCount without leaking secrets or data.
6. Legacy parser fallback compatibility.
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from conftest import FakeLlm, load_request, make_token
from onusfit_ai.shared.contracts.tools import (
    TOOL_GET_NUTRITION_SUMMARY,
    TOOL_GET_RECENT_WORKOUTS,
    TOOL_GET_WEIGHT_TREND,
    TOOL_SEARCH_EXERCISES,
)
from onusfit_ai.shared.llm.ports import ToolExecutionResult
from onusfit_ai.shared.tools import InternalToolsClient, get_tools_client

URL = "/internal/v1/ai/coach/chat"
TEST_USER_ID = "11111111-1111-1111-1111-111111111111"


def auth_header(user_id: str = TEST_USER_ID) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(sub=user_id)}"}


def test_tools_disabled_by_default(client: TestClient, fake_llm: FakeLlm) -> None:
    """Mandatory condition: AI_COACH_CHAT_TOOLS defaults to false."""
    response = client.post(URL, json=load_request("full"), headers=auth_header())
    assert response.status_code == 200

    # Ensure fake LLM did not receive tools or tool handler
    assert len(fake_llm.calls) == 1
    assert fake_llm.calls[0]["tools"] is None
    assert fake_llm.calls[0]["tool_handler"] is None

    body = response.json()
    assert body["outcome"] == "ok"
    assert body["result"]["toolCalls"] is None


def test_tools_enabled_passes_tools_and_tool_handler(
    client: TestClient, fake_llm: FakeLlm, monkeypatch: pytest.MonkeyPatch
) -> None:
    """When AI_COACH_CHAT_TOOLS=true, approved tools and tool_handler are wired."""
    monkeypatch.setenv("AI_COACH_CHAT_TOOLS", "true")

    response = client.post(URL, json=load_request("full"), headers=auth_header())
    assert response.status_code == 200

    assert len(fake_llm.calls) == 1
    tools = fake_llm.calls[0]["tools"]
    tool_handler = fake_llm.calls[0]["tool_handler"]

    assert tools is not None
    assert callable(tool_handler)
    # Check that the 4 approved tools are declared
    tool_declarations = tools[0].function_declarations if tools else []
    names = {d.name for d in tool_declarations}
    assert names == {
        TOOL_GET_RECENT_WORKOUTS,
        TOOL_GET_NUTRITION_SUMMARY,
        TOOL_GET_WEIGHT_TREND,
        TOOL_SEARCH_EXERCISES,
    }


@pytest.mark.asyncio
async def test_user_id_strictly_bound_to_jwt_claims(
    client: TestClient, fake_llm: FakeLlm, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Anti-confused-deputy: user_id must come exclusively from verified JWT claims.user_id."""
    monkeypatch.setenv("AI_COACH_CHAT_TOOLS", "true")
    target_user = "22222222-2222-2222-2222-222222222222"

    mock_tools_client = AsyncMock(spec=InternalToolsClient)
    mock_tools_client.execute_tool.return_value = {"workouts": []}

    app = client.app
    app.dependency_overrides[get_tools_client] = lambda: mock_tools_client
    try:
        response = client.post(
            URL,
            json=load_request("full"),
            headers=auth_header(user_id=target_user) | {"X-Request-Id": "trace-deputy-check"},
        )
        assert response.status_code == 200

        tool_handler = fake_llm.calls[0]["tool_handler"]
        assert callable(tool_handler)

        # Invoke handler as the LLM loop would
        await tool_handler(TOOL_GET_RECENT_WORKOUTS, {"days": 7})

        # Verify execute_tool was called with target_user from JWT and NOT from any other source
        mock_tools_client.execute_tool.assert_awaited_once_with(
            name=TOOL_GET_RECENT_WORKOUTS,
            args={"days": 7},
            user_id=target_user,
            request_id="trace-deputy-check",
        )
    finally:
        app.dependency_overrides.pop(get_tools_client, None)


def test_tool_execution_enriches_sources_and_populates_tool_calls(
    client: TestClient, fake_llm: FakeLlm, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Executed tool names populate toolCalls and authoritative source labels populate sources."""
    monkeypatch.setenv("AI_COACH_CHAT_TOOLS", "true")

    fake_llm.tool_calls = [
        ToolExecutionResult(
            tool_name=TOOL_GET_RECENT_WORKOUTS,
            args={"days": 7},
            result={"workouts": [{"name": "Leg Day"}]},
        ),
        ToolExecutionResult(
            tool_name=TOOL_GET_NUTRITION_SUMMARY,
            args={"days": 7},
            result={"days": []},
        ),
    ]

    response = client.post(URL, json=load_request("full"), headers=auth_header())
    assert response.status_code == 200

    body = response.json()
    assert body["result"]["toolCalls"] == [
        TOOL_GET_RECENT_WORKOUTS,
        TOOL_GET_NUTRITION_SUMMARY,
    ]
    # Existing sources + enriched sources from tools
    assert "recent_workouts" in body["result"]["sources"]
    assert "nutrition_summary" in body["result"]["sources"]
    assert "Profile" in body["result"]["sources"]


def test_telemetry_logs_tool_calls_count_without_leaks(
    client: TestClient, fake_llm: FakeLlm, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Telemetry must log toolCallsCount without exposing raw arguments or tool response bodies."""
    monkeypatch.setenv("AI_COACH_CHAT_TOOLS", "true")

    fake_llm.tool_calls = [
        ToolExecutionResult(
            tool_name=TOOL_GET_RECENT_WORKOUTS,
            args={"days": 7},
            result={"workouts": [{"name": "Deadlift Secret 100kg"}]},
        )
    ]

    with patch("onusfit_ai.features.coach.application.chat.log_ai_call") as mock_log:
        response = client.post(
            URL,
            json=load_request("full"),
            headers=auth_header() | {"X-Request-Id": "trace-telemetry-1"},
        )
        assert response.status_code == 200

        mock_log.assert_called_once()
        _, kwargs = mock_log.call_args
        assert kwargs["feature"] == "coach_chat"
        assert kwargs["trace_id"] == "trace-telemetry-1"
        assert kwargs["tool_calls_count"] == 1
        # Confirm sensitive data is NOT passed into telemetry
        assert "Deadlift Secret" not in str(kwargs)
        assert "workouts" not in kwargs


def test_legacy_mode_supports_tool_calls(
    client: TestClient, fake_llm: FakeLlm, monkeypatch: pytest.MonkeyPatch
) -> None:
    """When structured outputs is disabled, toolCalls and sources are still enriched."""
    monkeypatch.setenv("AI_COACH_CHAT_TOOLS", "true")
    monkeypatch.setenv("AI_COACH_CHAT_STRUCTURED_OUTPUTS", "false")

    fake_llm.text = "Hello! Keep up the great leg workouts."
    fake_llm.tool_calls = [
        ToolExecutionResult(
            tool_name=TOOL_GET_WEIGHT_TREND,
            args={"days": 30},
            result={"trend": "stable"},
        )
    ]

    response = client.post(URL, json=load_request("sparse"), headers=auth_header())
    assert response.status_code == 200

    body = response.json()
    assert body["result"]["toolCalls"] == [TOOL_GET_WEIGHT_TREND]
    assert "weight_trend" in body["result"]["sources"]
