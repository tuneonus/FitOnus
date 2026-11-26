"""Integration tests for Phase 13 Stage 09 AI Coach wiring, flags, and privacy."""

import logging
from typing import Any

import pytest
from fastapi.testclient import TestClient

from conftest import FakeLlm, load_request, make_token
from onusfit_ai.features.coach.application.chat import is_multi_agent_enabled
from onusfit_ai.shared.config import configuration_problems, get_settings
from onusfit_ai.shared.tools import InternalToolsClient, get_tools_client

URL = "/internal/v1/ai/coach/chat"


def _auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token()}"}


def test_multi_agent_feature_flag_disabled_by_default_and_validates(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("AI_COACH_MULTI_AGENT_ENABLED", raising=False)
    monkeypatch.delenv("COACH_MULTI_AGENT_ENABLED", raising=False)
    assert is_multi_agent_enabled() is False
    assert get_settings().multi_agent_enabled is False

    # Invalid flag fails closed & reports configuration problem
    monkeypatch.setenv("AI_COACH_MULTI_AGENT_ENABLED", "not_a_boolean")
    assert is_multi_agent_enabled() is False
    assert get_settings().multi_agent_enabled is False
    probs = configuration_problems()
    assert any("AI_COACH_MULTI_AGENT_ENABLED" in p for p in probs)

    # Explicit valid enable
    monkeypatch.setenv("AI_COACH_MULTI_AGENT_ENABLED", "true")
    assert is_multi_agent_enabled() is True
    assert get_settings().multi_agent_enabled is True


def test_coach_http_endpoint_preserves_legacy_when_disabled_and_runs_multi_agent_when_enabled(
    client: TestClient,
    fake_llm: FakeLlm,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    # 1. Default disabled -> standard Coach path
    monkeypatch.delenv("AI_COACH_MULTI_AGENT_ENABLED", raising=False)
    resp_off = client.post(
        URL,
        json=load_request("full"),
        headers=_auth() | {"X-Request-Id": "req-ma-off"},
    )
    assert resp_off.status_code == 200
    assert resp_off.json()["traceId"] == "req-ma-off"

    # 2. Enabled -> HTTP route runs compiled Multi-Agent workflow preserving response contract
    class _FakeTools(InternalToolsClient):
        def __init__(self) -> None:
            super().__init__(
                node_api_url="http://127.0.0.1:3000",
                service_secret="test-secret-test-secret-test-secret-123",
            )

        async def execute_tool(
            self,
            name: str,
            args: dict[str, Any],
            user_id: str,
            request_id: str,
        ) -> dict[str, Any]:
            if name == "get_recent_workouts":
                return {"workouts": [{"name": "Pull Day", "totalVolumeKg": 3200}]}
            if name == "get_nutrition_summary":
                return {"days": [{"calories": 1950, "proteinG": 135}]}
            return {"ok": True}

    app = client.app  # type: ignore[union-attr]
    app.dependency_overrides[get_tools_client] = lambda: _FakeTools()
    monkeypatch.setenv("AI_COACH_MULTI_AGENT_ENABLED", "true")
    monkeypatch.setenv("MCP_ENABLED", "true")

    fake_llm.text = (
        '{"text":"உங்கள் உடற்பயிற்சி மற்றும் புரதம் சிறப்பாக உள்ளது.",'
        '"followUps":["Next session"],"sources":["Profile"],"medicalNote":false}'
    )
    payload = load_request("full")
    payload["message"] = "Analyze my workout and nutrition consistency."

    with caplog.at_level(logging.INFO):
        resp_on = client.post(
            URL,
            json=payload,
            headers=_auth() | {"X-Request-Id": "req-ma-on-1"},
        )

    assert resp_on.status_code == 200
    body = resp_on.json()
    assert body["outcome"] == "ok"
    assert body["traceId"] == "req-ma-on-1"
    assert "text" in body["result"]
    assert body["result"]["blocks"] is None

    # Privacy guarantee: telemetry logs NEVER emit user_id or user message/records
    all_logs = "\n".join(r.getMessage() for r in caplog.records)
    assert "11111111-1111-1111-1111-111111111111" not in all_logs
    assert "Analyze my workout" not in all_logs
    events = {getattr(r, "event", None) for r in caplog.records}
    assert (
        "multi_agent.routing.decided" in events
        or "Multi-agent supervisor routing decision made" in all_logs
    )
    assert (
        "multi_agent.workflow.completed" in events or "Multi-agent workflow completed" in all_logs
    )
