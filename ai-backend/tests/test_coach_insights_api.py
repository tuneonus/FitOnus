import asyncio
import json
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from conftest import INSIGHTS_FIXTURES, FakeLlm, make_token
from onusfit_ai.main import create_app
from onusfit_ai.shared.errors import AiError
from onusfit_ai.shared.llm.dependencies import get_llm
from onusfit_ai.shared.llm.gemini import GeminiClient
from test_gemini_client import FakeSdk, make_response, overloaded, rate_limit

URL = "/internal/v1/ai/coach/insights"
MODEL = {"primary": "gemini-primary", "fallback": "gemini-backup"}
PROMPT_CASES = json.loads((INSIGHTS_FIXTURES / "prompt_cases.json").read_text(encoding="utf-8"))
CONTEXT: dict[str, Any] = next(c for c in PROMPT_CASES if c["name"] == "A_full__en")["context"]
GOOD_REPLY = json.dumps(
    {
        "greeting": "Good morning Karthik!",
        "recommendation": "Target Leg Day today.",
        "insights": [
            {
                "id": "ins-1",
                "title": "Workout Consistency",
                "description": "You trained twice recently.",
                "category": "workout",
                "priority": "high",
                "severity": "positive",
                "action": "View Workout",
                "question": "What is scheduled for Leg Day?",
                "evidence": ["Upper Body Push logged"],
                "confidence": "high",
                "requiresDevice": False,
            }
        ],
    }
)


def auth(scope: str = "ai:coach:insights") -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(scope=scope)}"}


def body(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "context": json.loads(json.dumps(CONTEXT)),
        "lang": "en",
        "model": MODEL,
        "deadlineMs": 20500,
    }
    base.update(overrides)
    return base


@pytest.fixture
def insights(fake_llm: FakeLlm) -> FakeLlm:
    fake_llm.text = GOOD_REPLY
    return fake_llm


def test_success_returns_the_public_shape(client: TestClient, insights: FakeLlm) -> None:
    response = client.post(URL, json=body(), headers=auth() | {"X-Request-Id": "r5"})

    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == "ok" and data["traceId"] == "r5"
    result = data["result"]
    assert result["greeting"] == "Good morning Karthik!" and result["hasSufficientData"] is True
    assert result["recommendation"] == "Target Leg Day today."
    assert result["insights"][0] == {
        "id": "ins-1",
        "title": "Workout Consistency",
        "description": "You trained twice recently.",
        "category": "workout",
        "priority": "high",
        "severity": "positive",
        "action": "View Workout",
        "question": "What is scheduled for Leg Day?",
        "evidence": ["Upper Body Push logged"],
        "confidence": "high",
        "requiresDevice": False,
    }
    assert data["usage"]["model"] == "gemini-primary"
    call = insights.calls[0]
    assert (call["primary"], call["fallback"], call["deadline_s"], call["media"]) == (
        "gemini-primary",
        "gemini-backup",
        20.5,
        None,
    )
    assert "OnusFit AI Insights Engine" in call["prompt"] and "Name: Karthik" in call["prompt"]


@pytest.mark.parametrize("lang", ["en", "ta", "tanglish", None])
def test_language_reaches_the_prompt(
    client: TestClient, insights: FakeLlm, lang: str | None
) -> None:
    assert client.post(URL, json=body(lang=lang), headers=auth()).status_code == 200
    prompt = insights.calls[0]["prompt"]
    expected = {"ta": "Tamil", "tanglish": "Tanglish"}.get(lang or "", "clean, encouraging English")
    assert expected in prompt


def test_the_complete_user_context_is_accepted_and_used(
    client: TestClient, insights: FakeLlm
) -> None:
    for case in PROMPT_CASES:  # every synthetic context Node can produce, nulls and floats included
        response = client.post(
            URL, json=body(context=case["context"], lang=case["lang"]), headers=auth()
        )
        assert response.status_code == 200, case["name"]


def test_an_unusable_reply_is_reported_not_invented(client: TestClient, insights: FakeLlm) -> None:
    insights.text = "Great job! Keep going."
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == "unusable" and data["result"] is None
    assert data["usage"]["totalTokens"] == 125  # the model call still happened and is reported


def test_an_empty_insight_list_is_unusable(client: TestClient, insights: FakeLlm) -> None:
    insights.text = json.dumps({"greeting": "Hi", "insights": []})
    assert client.post(URL, json=body(), headers=auth()).json()["outcome"] == "unusable"


@pytest.mark.parametrize(
    "mutate",
    [
        lambda b: b.pop("context"),
        lambda b: b["context"].pop("profile"),
        lambda b: b["context"]["profile"].update(displayName="x" * 201),
        lambda b: b["context"].update(recentWorkouts=[b["context"]["recentWorkouts"][0]] * 51),
        lambda b: b.update(deadlineMs=10),
        lambda b: b.update(deadlineMs=99999),
        lambda b: b.update(userId="someone"),
        lambda b: b.update(message="not accepted here"),
        lambda b: b.update(lang="x" * 51),
        lambda b: b.update(model={"primary": "bad name!"}),
        lambda b: b.pop("model"),
    ],
)
def test_invalid_requests_are_rejected_without_echoing_input(
    client: TestClient, insights: FakeLlm, mutate: Any
) -> None:
    payload = body()
    payload["context"]["profile"]["primaryGoal"] = "SECRET-GOAL-TEXT"
    mutate(payload)
    response = client.post(URL, json=payload, headers=auth())
    assert response.status_code == 422
    assert "SECRET-GOAL-TEXT" not in response.text and "Karthik" not in response.text
    assert insights.calls == []


@pytest.mark.parametrize("scope", ["ai:coach:chat", "ai:meals:photo", "ai:speech:transcribe"])
def test_other_scopes_are_refused(client: TestClient, insights: FakeLlm, scope: str) -> None:
    assert client.post(URL, json=body(), headers=auth(scope=scope)).status_code == 401
    assert insights.calls == []


def test_an_insights_token_does_not_open_the_chat_endpoint(
    client: TestClient, insights: FakeLlm
) -> None:
    payload = {"message": "hi", "context": CONTEXT, "model": MODEL, "deadlineMs": 20000}
    response = client.post("/internal/v1/ai/coach/chat", json=payload, headers=auth())
    assert response.status_code == 401


def test_missing_or_wrong_token_is_rejected(client: TestClient, insights: FakeLlm) -> None:
    assert client.post(URL, json=body()).status_code == 401
    wrong = {"Authorization": "Bearer " + make_token(secret="x" * 40, scope="ai:coach:insights")}
    assert client.post(URL, json=body(), headers=wrong).status_code == 401
    assert insights.calls == []


def test_gemini_errors_become_structured_json(fake_llm: FakeLlm) -> None:
    fake_llm.error = AiError(
        status_code=503,
        code="PROVIDER_UNAVAILABLE",
        message="busy",
        retry_after_seconds=10,
        dispatched=True,
    )
    app = create_app()
    app.dependency_overrides[get_llm] = lambda: fake_llm
    response = TestClient(app).post(URL, json=body(), headers=auth())
    assert response.status_code == 503
    assert response.json()["error"] == {
        "code": "PROVIDER_UNAVAILABLE",
        "message": "busy",
        "dispatched": True,
        "retryAfterSeconds": 10,
    }


def test_user_data_and_reply_are_never_logged(
    client: TestClient, insights: FakeLlm, caplog: pytest.LogCaptureFixture
) -> None:
    payload = body()
    payload["context"]["profile"]["displayName"] = "PRIVATE-NAME"
    payload["context"]["profile"]["primaryGoal"] = "PRIVATE-GOAL"
    payload["context"]["recentWorkouts"][0]["name"] = "PRIVATE-WORKOUT"
    insights.text = GOOD_REPLY.replace("Workout Consistency", "PRIVATE-REPLY-TITLE")
    with caplog.at_level("DEBUG"):
        assert client.post(URL, json=payload, headers=auth()).status_code == 200
    logged = "\n".join(r.getMessage() for r in caplog.records)
    assert "coach_insights" in logged
    for private in ("PRIVATE-NAME", "PRIVATE-GOAL", "PRIVATE-WORKOUT", "PRIVATE-REPLY-TITLE"):
        assert private not in logged


# --- the real GeminiClient with a fake SDK (no network): fallback and timeouts ---


def app_with_sdk(sdk: Any, attempt_timeout_s: float = 20.0) -> TestClient:
    llm = GeminiClient(None, sdk_client=sdk, attempt_timeout_s=attempt_timeout_s)
    app = create_app()
    app.dependency_overrides[get_llm] = lambda: llm
    return TestClient(app)


def test_the_backup_model_answers_when_the_primary_is_overloaded() -> None:
    sdk = FakeSdk({"gemini-primary": overloaded(), "gemini-backup": make_response(GOOD_REPLY)})
    response = app_with_sdk(sdk).post(URL, json=body(), headers=auth())

    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == "ok"
    assert data["usage"]["model"] == "gemini-backup" and data["usage"]["isFallback"] is True
    assert sdk.calls == ["gemini-primary", "gemini-backup"]
    assert sdk.contents[0] == sdk.contents[1]  # the same prompt (plain text, no media) to both


def test_both_models_failing_is_a_controlled_503_after_exactly_two_calls() -> None:
    sdk = FakeSdk({"gemini-primary": overloaded(), "gemini-backup": overloaded()})
    response = app_with_sdk(sdk).post(URL, json=body(), headers=auth())
    assert response.status_code == 503
    error = response.json()["error"]
    assert (error["code"], error["dispatched"]) == ("AI_UNAVAILABLE", True)
    assert sdk.calls == ["gemini-primary", "gemini-backup"]


def test_gemini_rate_limit_is_a_429_without_provider_text() -> None:
    sdk = FakeSdk({"gemini-primary": rate_limit()})
    payload = body(model={"primary": "gemini-primary"})
    response = app_with_sdk(sdk).post(URL, json=payload, headers=auth())
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "PROVIDER_RATE_LIMITED"
    assert "slow" not in response.text and sdk.calls == ["gemini-primary"]


def test_a_hanging_gemini_call_times_out_once_without_a_retry() -> None:
    async def hang() -> Any:
        await asyncio.sleep(5)
        return SimpleNamespace(text="never")

    sdk = FakeSdk({"gemini-primary": hang, "gemini-backup": make_response(GOOD_REPLY)})
    response = app_with_sdk(sdk, attempt_timeout_s=0.05).post(
        URL, json=body(model={"primary": "gemini-primary"}), headers=auth()
    )
    assert response.status_code == 504
    error = response.json()["error"]
    assert (error["code"], error["dispatched"]) == ("PROVIDER_TIMEOUT", True)
    assert sdk.calls == ["gemini-primary"]


def test_a_missing_gemini_key_fails_before_any_call_and_is_not_billable() -> None:
    response = TestClient(create_app()).post(URL, json=body(), headers=auth())
    assert response.status_code == 503
    error = response.json()["error"]
    assert (error["code"], error["dispatched"]) == ("PROVIDER_NOT_CONFIGURED", False)
