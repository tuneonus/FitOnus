"""Phase 20 production architecture, resilience, pooling, and boundary tests."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from conftest import FakeLlm, make_token
from onusfit_ai.features.coach.application.multi_agent.budgets import (
    CumulativeBudgetTracker,
    MultiAgentBudgetExceededError,
)
from onusfit_ai.features.coach.domain.multi_agent import MultiAgentExecutionBudget
from onusfit_ai.main import create_app, lifespan
from onusfit_ai.shared.auth.auth import ReplayCache
from onusfit_ai.shared.health.router import is_shutting_down, set_shutting_down
from onusfit_ai.shared.llm.gemini import GeminiClient
from onusfit_ai.shared.llm.ports import LlmServiceError
from onusfit_ai.shared.observability import FEATURE_BY_PATH
from onusfit_ai.shared.tools.client import (
    InternalToolsClient,
    close_shared_http_client,
    get_shared_http_client,
)


def test_embed_response_satisfies_node_schema_contract(
    client: TestClient, fake_llm: FakeLlm
) -> None:
    token = make_token(scope="ai:embed")
    response = client.post(
        "/internal/v1/ai/embed",
        headers={
            "Authorization": f"Bearer {token}",
            "X-Request-Id": "embed-req-phase20",
        },
        json={
            "texts": ["Progressive overload principles"],
            "model": "gemini-embedding-001",
            "dimensions": 768,
            "taskType": "RETRIEVAL_DOCUMENT",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["outcome"] == "ok"
    assert body["traceId"] == "embed-req-phase20"
    assert body["count"] == 1
    assert body["dimensions"] == 768
    usage = body["usage"]
    assert usage["model"] == "gemini-embedding-001"
    assert usage["isFallback"] is False
    assert isinstance(usage["inputTokens"], int) and usage["inputTokens"] >= 1
    assert usage["outputTokens"] == 0
    assert usage["cachedTokens"] == 0
    assert usage["thinkingTokens"] == 0
    assert usage["totalTokens"] == usage["inputTokens"]
    assert isinstance(usage["durationMs"], int) and usage["durationMs"] >= 0


@pytest.mark.asyncio
async def test_embed_content_enforces_python_timeout() -> None:
    class HangingModels:
        async def embed_content(self, **_kwargs: Any) -> Any:
            await asyncio.sleep(5.0)
            return SimpleNamespace(embeddings=[])

    sdk = SimpleNamespace(aio=SimpleNamespace(models=HangingModels()))
    client = GeminiClient(api_key="test-key", sdk_client=sdk)

    with pytest.raises(LlmServiceError) as exc_info:
        await client.embed_content(["test text"], timeout_s=0.05)

    assert exc_info.value.code == "PROVIDER_TIMEOUT"
    assert exc_info.value.dispatched is True


def test_health_ready_reflects_shutdown_and_production_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    set_shutting_down(False)
    app = create_app()
    test_client = TestClient(app)

    assert test_client.get("/health/ready").status_code == 200

    set_shutting_down(True)
    draining = test_client.get("/health/ready")
    assert draining.status_code == 503
    assert draining.json()["error"]["code"] == "SERVICE_UNAVAILABLE"

    set_shutting_down(False)
    monkeypatch.setenv("ONUSFIT_AI_ENV", "production")
    monkeypatch.delenv("AI_SERVICE_JWT_SECRET", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    misconfigured = test_client.get("/health/ready")
    assert misconfigured.status_code == 503
    assert misconfigured.json()["error"]["code"] == "SERVICE_UNAVAILABLE"


@pytest.mark.asyncio
async def test_lifespan_manages_readiness_and_shared_http_client(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ONUSFIT_AI_ENV", "development")
    app = create_app()

    async with lifespan(app):
        assert is_shutting_down() is False
        c1 = await get_shared_http_client()
        c2 = await get_shared_http_client()
        assert c1 is c2
        assert not c1.is_closed

    assert is_shutting_down() is True
    assert c1.is_closed
    set_shutting_down(False)


@pytest.mark.asyncio
async def test_internal_tools_client_uses_pooled_shared_client(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await close_shared_http_client()
    seen_clients: list[int] = []

    class FakeResponse:
        status_code = 200

        def json(self) -> dict[str, Any]:
            return {"data": {"workouts": [], "personalRecords": []}}

    pooled = await get_shared_http_client()

    async def fake_post(url: str, **kwargs: Any) -> FakeResponse:
        seen_clients.append(id(pooled))
        return FakeResponse()

    monkeypatch.setattr(pooled, "post", fake_post)

    tools = InternalToolsClient("http://127.0.0.1:3000", "s" * 32)
    res1 = await tools.execute_tool("get_recent_workouts", {"days": 7}, "usr-1", "req-1")
    res2 = await tools.execute_tool("get_recent_workouts", {"days": 7}, "usr-1", "req-2")

    assert "workouts" in res1 and "workouts" in res2
    assert len(seen_clients) == 2 and seen_clients[0] == seen_clients[1]
    await close_shared_http_client()


def test_replay_cache_bounds_memory_and_rejects_replay() -> None:
    cache = ReplayCache(max_entries=3)
    assert cache.check_and_store("jti-1", expires_at=200.0, now=100.0) is True
    assert cache.check_and_store("jti-1", expires_at=200.0, now=101.0) is False
    assert cache.check_and_store("jti-2", expires_at=200.0, now=102.0) is True
    assert cache.check_and_store("jti-3", expires_at=200.0, now=103.0) is True
    # Adding 4th entry evicts oldest (jti-1) so size stays bounded at 3
    assert cache.check_and_store("jti-4", expires_at=200.0, now=104.0) is True
    assert len(cache._seen) <= 3


def test_stream_route_included_in_observability_feature_map() -> None:
    assert FEATURE_BY_PATH.get("/internal/v1/ai/coach/chat/stream") == "coach_chat"
    paths = set(create_app().openapi()["paths"])
    assert "/internal/v1/ai/coach/chat/stream" in paths


@pytest.mark.asyncio
async def test_multi_agent_cumulative_budget_and_cancellation() -> None:
    budget = MultiAgentExecutionBudget(
        max_agent_invocations=4,
        max_llm_calls=1,
        max_total_tokens=500,
        deadline_seconds=10.0,
    )
    tracker = CumulativeBudgetTracker(budget)
    await tracker.reserve_llm_call()
    await tracker.record_tokens(input_tokens=200, output_tokens=100, total=300)

    with pytest.raises(MultiAgentBudgetExceededError) as exc_info:
        await tracker.reserve_llm_call()
    assert exc_info.value.reason_code == "max_llm_calls_reached"

    tracker.cancel("client_disconnected")
    with pytest.raises(MultiAgentBudgetExceededError) as cancel_exc:
        await tracker.reserve_agent_invocation()
    assert cancel_exc.value.reason_code == "cancelled"
    assert tracker.snapshot().total_tokens == 300
