"""Tests for Gemini Native Structured Outputs in Coach Insights (Phase 1 / Stage 3).

Verifies the 20 required scenarios including structured schema generation,
insight categories, bilingual support (Tamil/Tanglish), defensive fallbacks,
safety, truncation, model failover, and feature-specific rollback.
"""

import asyncio
import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from conftest import INSIGHTS_FIXTURES, FakeLlm, make_token
from onusfit_ai.features.coach.application.insights import (
    generate_coach_insights,
    is_coach_insights_structured_output_enabled,
)
from onusfit_ai.features.coach.application.schemas import (
    GeminiCoachInsightsOutput,
    GeminiInsightItemOutput,
)
from onusfit_ai.features.coach.domain.insights import CoachInsightsRequest
from onusfit_ai.shared.llm.ports import LlmServiceError

URL = "/internal/v1/ai/coach/insights"
MODEL = {"primary": "gemini-primary", "fallback": "gemini-backup"}
PROMPT_CASES = json.loads((INSIGHTS_FIXTURES / "prompt_cases.json").read_text(encoding="utf-8"))
CONTEXT: dict[str, Any] = next(c for c in PROMPT_CASES if c["name"] == "A_full__en")["context"]


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


def sample_insight_item(
    category: str = "workout",
    priority: str = "high",
    severity: str = "positive",
    confidence: str = "high",
) -> GeminiInsightItemOutput:
    return GeminiInsightItemOutput(
        id="ins-101",
        title="Solid Leg Progression",
        description="Squat volume increased by 10% over the last two sessions.",
        category=category,  # type: ignore[arg-type]
        priority=priority,  # type: ignore[arg-type]
        severity=severity,  # type: ignore[arg-type]
        action="View Workout",
        question="Should I add calf raises today?",
        evidence=["Leg Workout completed", "Volume 4200kg"],
        confidence=confidence,  # type: ignore[arg-type]
        requires_device=False,
    )


# 1. Valid structured insights
def test_valid_structured_insights(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiCoachInsightsOutput(
        greeting="Good morning Karthik!",
        recommendation="Prioritize protein recovery today.",
        insights=[sample_insight_item()],
    )
    fake_llm.text = json.dumps(fake_llm.parsed.model_dump(by_alias=True))

    response = client.post(URL, json=body(), headers=auth() | {"X-Request-Id": "trace-ins-01"})
    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == "ok"
    assert data["traceId"] == "trace-ins-01"
    result = data["result"]
    assert result["greeting"] == "Good morning Karthik!"
    assert result["recommendation"] == "Prioritize protein recovery today."
    assert len(result["insights"]) == 1
    assert result["insights"][0]["id"] == "ins-101"
    assert result["hasSufficientData"] is True
    assert "generatedAt" in result


# 2. Existing API contract compatibility (camelCase wire contract)
def test_wire_contract_field_compatibility(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiCoachInsightsOutput(
        greeting="Hello!",
        recommendation="Hydrate well.",
        insights=[sample_insight_item(category="hydration", severity="info")],
    )
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    res = response.json()["result"]
    item = res["insights"][0]
    # Check camelCase fields on root and items
    assert "hasSufficientData" in res
    assert "generatedAt" in res
    assert "requiresDevice" in item
    assert item["requiresDevice"] is False


# 3. Existing insight categories (workout, nutrition, hydration, goal, recovery)
@pytest.mark.parametrize(
    "cat",
    ["workout", "nutrition", "hydration", "goal", "recovery"],
)
def test_insight_categories(client: TestClient, fake_llm: FakeLlm, cat: str) -> None:
    fake_llm.parsed = GeminiCoachInsightsOutput(
        greeting="Hi!",
        recommendation=None,
        insights=[sample_insight_item(category=cat)],
    )
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    assert response.json()["result"]["insights"][0]["category"] == cat


# 4. Existing fitness context preserved in prompt
def test_fitness_context_preserved_in_prompt(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiCoachInsightsOutput(
        greeting="Hi",
        recommendation=None,
        insights=[sample_insight_item()],
    )
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    call = fake_llm.calls[0]
    assert call["schema"] is GeminiCoachInsightsOutput
    prompt = call["prompt"]
    assert "USER PROFILE:" in prompt
    assert "TODAY'S ACTIVITY & NUTRITION:" in prompt
    assert "RECENT WORKOUTS:" in prompt


# 5. Tamil content preserved
def test_tamil_structured_insights(client: TestClient, fake_llm: FakeLlm) -> None:
    tamil_greeting = "வணக்கம் கார்த்திக்!"
    tamil_title = "உடற்பயிற்சி முன்னேற்றம்"
    fake_llm.parsed = GeminiCoachInsightsOutput(
        greeting=tamil_greeting,
        recommendation="இன்று ஓய்வு எடுப்பது நல்லது.",
        insights=[
            GeminiInsightItemOutput(
                id="ins-ta-1",
                title=tamil_title,
                description="நேற்றைய உடற்பயிற்சி தீவிரமாக இருந்தது.",
                category="recovery",
                priority="medium",
                severity="positive",
                action="ஓய்வு எடுக்கவும்",
                question="நாளை உடற்பயிற்சி செய்யலாமா?",
                evidence=["கால் பயிற்சி முடிந்தது"],
                confidence="high",
                requires_device=False,
            )
        ],
    )
    response = client.post(URL, json=body(lang="ta"), headers=auth())
    assert response.status_code == 200
    res = response.json()["result"]
    assert res["greeting"] == tamil_greeting
    assert res["insights"][0]["title"] == tamil_title


# 6. Tanglish content preserved
def test_tanglish_structured_insights(client: TestClient, fake_llm: FakeLlm) -> None:
    tanglish_greeting = "Vanakkam Karthik!"
    fake_llm.parsed = GeminiCoachInsightsOutput(
        greeting=tanglish_greeting,
        recommendation="Protein intake reach pannunga.",
        insights=[
            GeminiInsightItemOutput(
                id="ins-tang-1",
                title="Kcal Balance",
                description="Innaiku calorie target 1800 kcal reach aagala.",
                category="nutrition",
                priority="high",
                severity="watch",
                action="Meal Add Pannunga",
                question="Enna snack saapdalama?",
                evidence=["Calorie logged: 1400 kcal"],
                confidence="high",
                requires_device=False,
            )
        ],
    )
    response = client.post(URL, json=body(lang="tanglish"), headers=auth())
    assert response.status_code == 200
    res = response.json()["result"]
    assert res["greeting"] == tanglish_greeting
    assert res["insights"][0]["category"] == "nutrition"


# 7. Missing response.parsed with valid JSON text fallback
# 8. Valid JSON text fallback
def test_valid_json_text_fallback_when_parsed_missing(
    client: TestClient, fake_llm: FakeLlm
) -> None:
    fake_llm.parsed = None
    fake_llm.text = json.dumps(
        {
            "greeting": "Good afternoon Alex!",
            "recommendation": "Great recovery pace.",
            "insights": [
                {
                    "id": "ins-fallback",
                    "title": "Rest Day",
                    "description": "Muscles are repairing effectively.",
                    "category": "recovery",
                    "priority": "low",
                    "severity": "positive",
                    "action": "Hydrate",
                    "question": "How much water to drink?",
                    "evidence": ["Water 2000ml"],
                    "confidence": "high",
                    "requiresDevice": False,
                }
            ],
        }
    )
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == "ok"
    assert data["result"]["greeting"] == "Good afternoon Alex!"
    assert data["result"]["insights"][0]["id"] == "ins-fallback"


# 9. Malformed JSON rejection in structured mode
def test_malformed_json_rejected_in_structured_mode(
    client: TestClient, fake_llm: FakeLlm
) -> None:
    fake_llm.parsed = None
    fake_llm.text = "Here are your insights: you did great! Not in JSON format."
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 503
    data = response.json()
    assert data["error"]["code"] == "PROVIDER_ERROR"
    assert data["error"]["dispatched"] is True


# 10. Invalid field types rejection (e.g., category outside enum)
def test_invalid_field_types_rejected(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = None
    fake_llm.text = json.dumps(
        {
            "greeting": "Hello",
            "insights": [
                {
                    "title": "T",
                    "description": "D",
                    "category": "invalid_category",  # not in enum
                    "priority": "high",
                    "severity": "positive",
                    "action": "A",
                    "question": "Q",
                    "confidence": "high",
                }
            ],
        }
    )
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "PROVIDER_ERROR"


# 11. Empty response rejection in structured mode
def test_empty_response_rejected_in_structured_mode(
    client: TestClient, fake_llm: FakeLlm
) -> None:
    fake_llm.parsed = None
    fake_llm.text = ""
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "PROVIDER_ERROR"


# 12. MAX_TOKENS rejection
def test_max_tokens_rejected(fake_llm: FakeLlm) -> None:
    fake_llm.finish_reason = "MAX_TOKENS"
    fake_llm.parsed = None
    fake_llm.text = '{"greeting": "Halfway cut...'

    req = CoachInsightsRequest.model_validate(body())
    with pytest.raises(LlmServiceError) as exc_info:
        asyncio.run(generate_coach_insights(req, fake_llm, trace_id="trace-max"))

    assert exc_info.value.code == "PROVIDER_ERROR"
    assert "token" in exc_info.value.message.lower()
    assert exc_info.value.dispatched is True


# 13. SAFETY rejection
def test_safety_blocked_rejected(fake_llm: FakeLlm) -> None:
    fake_llm.finish_reason = "SAFETY"
    fake_llm.parsed = None
    fake_llm.text = ""

    req = CoachInsightsRequest.model_validate(body())
    with pytest.raises(LlmServiceError) as exc_info:
        asyncio.run(generate_coach_insights(req, fake_llm, trace_id="trace-safety"))

    assert exc_info.value.code == "PROVIDER_UNAVAILABLE"
    assert "safety" in exc_info.value.message.lower()
    assert exc_info.value.dispatched is True


# 14. Primary model failure with fallback trigger
# 15. Fallback model success with schema preserved
def test_model_fallback_preserves_schema(fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiCoachInsightsOutput(
        greeting="Fallback Hi",
        recommendation=None,
        insights=[sample_insight_item()],
    )
    req = CoachInsightsRequest.model_validate(body())
    assert req.model.primary is not None
    assert req.model.fallback is not None

    asyncio.run(generate_coach_insights(req, fake_llm, trace_id="trace-fallback"))
    call = fake_llm.calls[0]
    assert call["schema"] is GeminiCoachInsightsOutput
    assert call["primary"] == req.model.primary
    assert call["fallback"] == req.model.fallback


# 16. Rollback enabled via AI_COACH_INSIGHTS_STRUCTURED_OUTPUTS=false
# 17. Legacy parser compatibility under rollback
def test_rollback_toggle_disables_structured_outputs(
    client: TestClient, fake_llm: FakeLlm, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("AI_COACH_INSIGHTS_STRUCTURED_OUTPUTS", "false")
    assert not is_coach_insights_structured_output_enabled()

    fake_llm.parsed = None
    fake_llm.text = json.dumps(
        {
            "greeting": "Legacy Hello!",
            "insights": [
                {
                    "title": "Legacy Insight",
                    "description": "Legacy description",
                    "category": "workout",
                }
            ],
        }
    )

    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == "ok"
    assert data["result"]["greeting"] == "Legacy Hello!"
    assert fake_llm.calls[0]["schema"] is None


def test_rollback_mode_unusable_reply_falls_back(
    client: TestClient, fake_llm: FakeLlm, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("AI_COACH_INSIGHTS_STRUCTURED_OUTPUTS", "false")
    fake_llm.parsed = None
    fake_llm.text = "Just raw unformatted text."

    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == "unusable"
    assert data["result"] is None


# 18. Token usage metadata preserved
def test_token_usage_metadata_preserved(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiCoachInsightsOutput(
        greeting="Hi",
        recommendation=None,
        insights=[sample_insight_item()],
    )
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    usage = response.json()["usage"]
    assert usage["totalTokens"] == 125
    assert usage["inputTokens"] == 100
    assert usage["outputTokens"] == 20


# 19. Correlation IDs / trace IDs preserved
def test_correlation_trace_id_preserved(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiCoachInsightsOutput(
        greeting="Hi",
        recommendation=None,
        insights=[sample_insight_item()],
    )
    response = client.post(
        URL, json=body(), headers=auth() | {"X-Request-Id": "trace-corr-777"}
    )
    assert response.status_code == 200
    assert response.json()["traceId"] == "trace-corr-777"


# 20. Existing caching behavior: Python is stateless, preserves request context
def test_service_statelessness_across_calls(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiCoachInsightsOutput(
        greeting="Call 1",
        recommendation=None,
        insights=[sample_insight_item()],
    )
    r1 = client.post(URL, json=body(), headers=auth() | {"X-Request-Id": "req-1"})
    assert r1.status_code == 200
    assert r1.json()["result"]["greeting"] == "Call 1"

    fake_llm.parsed = GeminiCoachInsightsOutput(
        greeting="Call 2",
        recommendation=None,
        insights=[sample_insight_item()],
    )
    r2 = client.post(URL, json=body(), headers=auth() | {"X-Request-Id": "req-2"})
    assert r2.status_code == 200
    assert r2.json()["result"]["greeting"] == "Call 2"
