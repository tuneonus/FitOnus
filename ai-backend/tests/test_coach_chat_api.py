from typing import Any

import pytest
from fastapi.testclient import TestClient
from fastapi.testclient import TestClient as _TC

from conftest import FakeLlm, load_request, make_token
from onusfit_ai.main import create_app
from onusfit_ai.shared.errors import AiError
from onusfit_ai.shared.llm.dependencies import get_llm
from onusfit_ai.shared.llm.errors import LlmServiceError

URL = "/internal/v1/ai/coach/chat"


def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token()}"}


def test_success_returns_camel_case_contract(client: TestClient, fake_llm: FakeLlm) -> None:
    response = client.post(
        URL, json=load_request("full"), headers=auth() | {"X-Request-Id": "req-abc"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["outcome"] == "ok"
    assert body["result"] == {
        "text": "Hello!",
        "followUps": ["Next?"],
        "sources": ["Profile", "AI Memory"],
        "medicalNote": False,
        "blocks": None,
        "toolCalls": None,
        "citations": None,
    }
    assert body["usage"]["model"] == "gemini-3.5-flash-lite"
    assert body["usage"]["thinkingTokens"] == 5
    assert body["traceId"] == "req-abc"
    # The LLM got Node's model choice and a deadline in seconds.
    assert fake_llm.calls[0]["primary"] == "gemini-3.5-flash-lite"
    assert fake_llm.calls[0]["fallback"] == "gemini-3.1-flash-lite"
    assert fake_llm.calls[0]["deadline_s"] == 20.0
    assert "CURRENT USER INQUIRY:\nInnaiku leg workout" in fake_llm.calls[0]["prompt"]


def test_unstructured_model_reply_is_flagged_in_legacy_mode(
    client: TestClient, fake_llm: FakeLlm, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("AI_COACH_CHAT_STRUCTURED_OUTPUTS", "false")
    fake_llm.text = "plain prose reply"
    body = client.post(URL, json=load_request("sparse"), headers=auth()).json()
    assert body["outcome"] == "unstructured"
    assert body["result"]["text"] == "plain prose reply"


def test_unstructured_model_reply_is_rejected_in_structured_mode(
    client: TestClient, fake_llm: FakeLlm
) -> None:
    fake_llm.text = "plain prose reply"
    fake_llm.parsed = None
    response = client.post(URL, json=load_request("sparse"), headers=auth())
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "PROVIDER_ERROR"


# Audit M5 (approved): the prompt never asks for `blocks`, but the mobile app renders them and an "action"
# block runs writes (log a meal, set the weight) after one tap. A block the model invented must never
# reach the app, so the field stays in the contract (Node and mobile unchanged) and is always null.
ACTION_BLOCK = {
    "type": "action",
    "id": "a1",
    "title": "Log breakfast",
    "summary": [{"label": "Calories", "value": "200 kcal"}],  # what the member READS ...
    "payload": {"kind": "updateWeight", "value": 1000},  # ... is not what runs on confirm
    "status": "pending",
}


def reply_with_blocks(blocks: Any) -> str:
    import json

    return json.dumps(
        {"text": "x", "followUps": ["Next?"], "sources": ["Profile"], "blocks": blocks}
    )


@pytest.mark.parametrize(
    "blocks",
    [
        [{"type": "metrics", "title": "T", "items": []}, 5],
        [ACTION_BLOCK],
        [{"type": "link", "label": "x", "description": "y", "route": "Anything"}],
        "not-a-list",
        {"type": "action"},
    ],
    ids=["display-block", "action-block", "link-block", "string", "object"],
)
def test_model_supplied_blocks_never_reach_the_response(
    client: TestClient, fake_llm: FakeLlm, blocks: Any
) -> None:
    fake_llm.text = reply_with_blocks(blocks)
    response = client.post(URL, json=load_request("sparse"), headers=auth())

    assert response.status_code == 200
    result = response.json()["result"]
    assert (
        result["blocks"] is None
    )  # still in the contract, so Node's schema and the app are unaffected
    assert "blocks" in result
    # Everything else about the reply is unchanged.
    assert (result["text"], result["followUps"], result["sources"]) == ("x", ["Next?"], ["Profile"])
    assert response.json()["outcome"] == "ok"


@pytest.mark.parametrize("depth", [900, 3000])
def test_a_deeply_nested_block_cannot_crash_the_response(
    client: TestClient, fake_llm: FakeLlm, depth: int
) -> None:
    # Before the fix a nested block was forwarded and serializing it raised RecursionError: an HTTP 500
    # after Gemini had already been billed (Node counts a 500 as dispatched, so the quota unit was lost).
    nested = "[" * depth + "]" * depth
    fake_llm.text = '{"text":"x","blocks":[{"type":"metrics","items":' + nested + "}]}"
    response = client.post(URL, json=load_request("sparse"), headers=auth())

    assert response.status_code == 200
    assert response.json()["result"]["blocks"] is None


@pytest.mark.parametrize(
    ("mutate", "field"),
    [
        (lambda b: b.update(message=""), "message"),
        (lambda b: b.update(message="x" * 1001), "message"),
        (lambda b: b.pop("context"), "context"),
        (lambda b: b.update(deadlineMs=10), "deadlineMs"),
        (lambda b: b.update(unknownField=1), "unknownField"),
        (lambda b: b["model"].update(primary="bad model name!"), "model.primary"),
        (lambda b: b.update(history=[{"role": "system", "text": "x"}]), "history.0.role"),
        (lambda b: b.update(userId="22222222-2222-2222-2222-222222222222"), "userId"),
    ],
)
def test_invalid_requests_are_rejected_without_echoing_input(
    client: TestClient, mutate: Any, field: str
) -> None:
    body = load_request("sparse")
    body["message"] = "SECRET-HEALTH-MESSAGE"
    mutate(body)

    response = client.post(URL, json=body, headers=auth())

    assert response.status_code == 422
    payload = response.json()
    assert payload["error"]["code"] == "INVALID_REQUEST"
    assert field in [f["field"] for f in payload["error"]["fields"]]
    assert "SECRET-HEALTH-MESSAGE" not in response.text  # never echo user content


def test_user_id_in_body_is_not_accepted(client: TestClient) -> None:
    body = load_request("sparse") | {"userId": "someone-else"}
    assert client.post(URL, json=body, headers=auth()).status_code == 422


def test_provider_errors_become_structured_json(fake_llm: FakeLlm) -> None:
    fake_llm.error = AiError(
        status_code=429,
        code="PROVIDER_RATE_LIMITED",
        message="slow down",
        retry_after_seconds=25,
        dispatched=True,
    )
    app = create_app()
    app.dependency_overrides[get_llm] = lambda: fake_llm
    response = _TC(app).post(URL, json=load_request("sparse"), headers=auth())

    assert response.status_code == 429
    assert response.json() == {
        "error": {
            "code": "PROVIDER_RATE_LIMITED",
            "message": "slow down",
            "dispatched": True,
            "retryAfterSeconds": 25,
        }
    }


def test_llm_service_error_maps_to_http_status(fake_llm: FakeLlm) -> None:
    fake_llm.error = LlmServiceError(
        code="PROVIDER_TIMEOUT",
        message="timed out",
        dispatched=False,
    )
    app = create_app()
    app.dependency_overrides[get_llm] = lambda: fake_llm
    response = _TC(app).post(URL, json=load_request("sparse"), headers=auth())

    assert response.status_code == 504
    assert response.json() == {
        "error": {
            "code": "PROVIDER_TIMEOUT",
            "message": "timed out",
            "dispatched": False,
        }
    }


def test_openapi_docs_are_not_public(client: TestClient) -> None:
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404


def test_message_memories_and_reply_are_never_logged(
    client: TestClient, fake_llm: FakeLlm, caplog: pytest.LogCaptureFixture
) -> None:
    body = load_request("full")
    body["message"] = "MY-PRIVATE-QUESTION-12345"
    body["memories"] = ["[MEDICAL]: PRIVATE-MEMORY-67890"]
    fake_llm.text = '{"text":"PRIVATE-REPLY-ABCDE","followUps":[],"sources":[]}'

    with caplog.at_level("DEBUG"):
        response = client.post(URL, json=body, headers=auth())

    assert response.status_code == 200
    logged = "\n".join(record.getMessage() for record in caplog.records)
    assert "coach_chat" in logged  # we do log metadata...
    for secret in ("MY-PRIVATE-QUESTION-12345", "PRIVATE-MEMORY-67890", "PRIVATE-REPLY-ABCDE"):
        assert secret not in logged  # ...but never content
