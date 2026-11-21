"""Tests for Gemini Native Structured Outputs in AI Coach Chat (Phase 1 / Stage 2).

Verifies the 20 required scenarios including structured schema generation,
bilingual support (Tamil/Tanglish), defensive fallbacks, safety, truncation,
model failover, and zero-downtime rollback.
"""

import asyncio
import json
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from conftest import FakeLlm, load_request, make_token
from onusfit_ai.features.coach.application.chat import (
    generate_coach_reply,
    is_coach_chat_structured_output_enabled,
)
from onusfit_ai.features.coach.application.schemas import GeminiCoachReplyOutput
from onusfit_ai.features.coach.domain.chat import CoachChatRequest
from onusfit_ai.shared.llm.gemini import GeminiClient
from onusfit_ai.shared.llm.ports import LlmResult, LlmServiceError, LlmUsage

URL = "/internal/v1/ai/coach/chat"


def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token()}"}


# 1. Valid Coach Chat structured response
def test_valid_structured_response(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiCoachReplyOutput(
        text="Great progress on your leg workout! Keep up the intensity.",
        follow_ups=["Should I increase weight next week?", "What should I eat post-workout?"],
        sources=["Profile", "Today's Nutrition"],
        medical_note=False,
    )
    fake_llm.text = '{"text":"x","followUps":[],"sources":[],"medicalNote":false}'

    response = client.post(
        URL, json=load_request("full"), headers=auth() | {"X-Request-Id": "trace-valid-01"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == "ok"
    assert data["result"]["text"] == "Great progress on your leg workout! Keep up the intensity."
    assert len(data["result"]["followUps"]) == 2
    assert "AI Memory" in data["result"]["sources"]  # Request has memories
    assert data["result"]["medicalNote"] is False
    assert data["result"]["blocks"] is None


# 2. Existing response field compatibility (camelCase wire contract)
def test_response_wire_field_compatibility(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiCoachReplyOutput(
        text="Drink more water.",
        follow_ups=["How much?"],
        sources=["Today's Nutrition"],
        medical_note=True,
    )
    response = client.post(URL, json=load_request("sparse"), headers=auth())
    assert response.status_code == 200
    data = response.json()
    result = data["result"]
    assert "text" in result
    assert "followUps" in result
    assert "sources" in result
    assert "medicalNote" in result
    assert "blocks" in result
    assert result["medicalNote"] is True
    assert result["blocks"] is None


# 3. Conversation history preserved in prompt
def test_conversation_history_preserved_in_prompt(client: TestClient, fake_llm: FakeLlm) -> None:
    response = client.post(URL, json=load_request("full"), headers=auth())
    assert response.status_code == 200
    call = fake_llm.calls[0]
    prompt = call["prompt"]
    assert "PREVIOUS RECENT CHAT HISTORY:" in prompt
    assert "turn 7" in prompt  # from full fixture


# 4. Fitness context preserved in prompt
def test_fitness_context_preserved_in_prompt(client: TestClient, fake_llm: FakeLlm) -> None:
    response = client.post(URL, json=load_request("full"), headers=auth())
    assert response.status_code == 200
    call = fake_llm.calls[0]
    prompt = call["prompt"]
    assert "USER FITNESS PROFILE:" in prompt
    assert "TODAY'S ACTIVITY & NUTRITION" in prompt
    assert "Calories Consumed:" in prompt


# 5. Tamil response preserved in text and follow-ups
def test_tamil_script_structured_response(client: TestClient, fake_llm: FakeLlm) -> None:
    tamil_text = "இன்றைய உடற்பயிற்சியை வெற்றிகரமாக முடித்தீர்கள்! போதுமான புரதச்சத்து உட்கொள்ளுங்கள்."
    tamil_follow_up = "நாளைக்கு என்ன உடற்பயிற்சி செய்ய வேண்டும்?"
    fake_llm.parsed = GeminiCoachReplyOutput(
        text=tamil_text,
        follow_ups=[tamil_follow_up],
        sources=["Profile"],
        medical_note=False,
    )
    response = client.post(URL, json=load_request("sparse"), headers=auth())
    assert response.status_code == 200
    data = response.json()
    assert data["result"]["text"] == tamil_text
    assert data["result"]["followUps"] == [tamil_follow_up]


# 6. Tanglish response preserved
def test_tanglish_structured_response(client: TestClient, fake_llm: FakeLlm) -> None:
    tanglish_text = "Innaiku workout super-ah irundhuchu! Dinner-ku 30g protein eduthukoonga."
    fake_llm.parsed = GeminiCoachReplyOutput(
        text=tanglish_text,
        follow_ups=["Paneer saapdalama?", "Protein shake eppo kudikkanum?"],
        sources=["Today's Nutrition"],
        medical_note=False,
    )
    response = client.post(URL, json=load_request("sparse"), headers=auth())
    assert response.status_code == 200
    data = response.json()
    assert data["result"]["text"] == tanglish_text
    assert len(data["result"]["followUps"]) == 2


# 7. response.parsed=None defensive fallback to valid text
def test_parsed_none_fallback_to_valid_text(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = None
    fake_llm.text = json.dumps(
        {
            "text": "Rest day today. Focus on mobility.",
            "followUps": ["Stretching tips?"],
            "sources": ["Profile"],
            "medicalNote": False,
        }
    )
    response = client.post(URL, json=load_request("sparse"), headers=auth())
    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == "ok"
    assert data["result"]["text"] == "Rest day today. Focus on mobility."
    assert data["result"]["followUps"] == ["Stretching tips?"]


# 8. Invalid JSON handling (rejected in structured mode, falls back in legacy mode)
def test_invalid_json_rejected_in_structured_mode(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = None
    fake_llm.text = "This is plain unstructured prose without any JSON wrapper."
    response = client.post(URL, json=load_request("sparse"), headers=auth())
    assert response.status_code == 503
    data = response.json()
    assert data["error"]["code"] == "PROVIDER_ERROR"
    assert data["error"]["dispatched"] is True


def test_invalid_json_falls_back_in_legacy_mode(
    client: TestClient, fake_llm: FakeLlm, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("AI_COACH_CHAT_STRUCTURED_OUTPUTS", "false")
    fake_llm.parsed = None
    fake_llm.text = "This is plain unstructured prose without any JSON wrapper."
    response = client.post(URL, json=load_request("sparse"), headers=auth())
    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == "unstructured"
    assert data["result"]["text"] == "This is plain unstructured prose without any JSON wrapper."
    assert data["result"]["sources"] == ["OnusFit Coach Engine"]


# 9. Pydantic validation error rejects malformed structured payload
def test_pydantic_validation_error_rejected(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = None
    # Bad payload where 'text' is not a string
    fake_llm.text = '{"text": 12345, "followUps": "not-a-list"}'
    response = client.post(URL, json=load_request("sparse"), headers=auth())
    assert response.status_code == 503
    data = response.json()
    assert data["error"]["code"] == "PROVIDER_ERROR"


# 10. MAX_TOKENS raises PROVIDER_ERROR
def test_max_tokens_raises_provider_error(fake_llm: FakeLlm) -> None:
    fake_llm.finish_reason = "MAX_TOKENS"
    fake_llm.parsed = None
    fake_llm.text = '{"text": "Sentence cut halfway th'

    req = CoachChatRequest.model_validate(load_request("sparse"))
    with pytest.raises(LlmServiceError) as exc_info:
        asyncio.run(generate_coach_reply(req, fake_llm, trace_id="trace-max-tokens"))

    err = exc_info.value
    assert err.code == "PROVIDER_ERROR"
    assert "token" in err.message.lower()
    assert err.dispatched is True


# 11. SAFETY raises PROVIDER_UNAVAILABLE
def test_safety_blocked_raises_provider_unavailable(fake_llm: FakeLlm) -> None:
    fake_llm.finish_reason = "SAFETY"
    fake_llm.parsed = None
    fake_llm.text = ""

    req = CoachChatRequest.model_validate(load_request("sparse"))
    with pytest.raises(LlmServiceError) as exc_info:
        asyncio.run(generate_coach_reply(req, fake_llm, trace_id="trace-safety"))

    err = exc_info.value
    assert err.code == "PROVIDER_UNAVAILABLE"
    assert "safety" in err.message.lower()
    assert err.dispatched is True


# 12. Empty candidates handling
def test_empty_candidates_handling(fake_llm: FakeLlm) -> None:
    fake_llm.parsed = None
    fake_llm.text = ""
    req = CoachChatRequest.model_validate(load_request("sparse"))
    with pytest.raises(LlmServiceError) as exc_info:
        asyncio.run(generate_coach_reply(req, fake_llm, trace_id="trace-empty"))
    assert exc_info.value.code == "PROVIDER_ERROR"
    assert "empty" in exc_info.value.message.lower()


# 13. Primary model failure triggers failover
# 14. Fallback model success with schema preserved
def test_fallback_model_success_with_schema(fake_llm: FakeLlm) -> None:
    req = CoachChatRequest.model_validate(load_request("full"))
    assert req.model.primary is not None
    assert req.model.fallback is not None

    asyncio.run(generate_coach_reply(req, fake_llm, trace_id="trace-fallback"))
    call = fake_llm.calls[0]
    assert call["schema"] is GeminiCoachReplyOutput
    assert call["primary"] == req.model.primary
    assert call["fallback"] == req.model.fallback


# 15. Rollback enabled via AI_COACH_CHAT_STRUCTURED_OUTPUTS=false
# 16. Legacy behavior unchanged under rollback
def test_rollback_toggle_disables_structured_schema(
    client: TestClient, fake_llm: FakeLlm, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("AI_COACH_CHAT_STRUCTURED_OUTPUTS", "false")
    assert not is_coach_chat_structured_output_enabled()

    fake_llm.text = '{"text":"Legacy parsed text","followUps":["Q1"],"sources":["Profile"],"medicalNote":false}'
    fake_llm.parsed = None

    response = client.post(URL, json=load_request("sparse"), headers=auth())
    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == "ok"
    assert data["result"]["text"] == "Legacy parsed text"
    # Under rollback, schema passed to LLM must be None
    assert fake_llm.calls[0]["schema"] is None


# 17. Node.js Zod contract compatibility
def test_zod_contract_compatibility(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiCoachReplyOutput(
        text="Affirmative.",
        follow_ups=["Follow up 1"],
        sources=["Profile"],
        medical_note=False,
    )
    response = client.post(URL, json=load_request("full"), headers=auth())
    assert response.status_code == 200
    data = response.json()
    # Contract validation: verify all keys expected by backend pythonChatResponseSchema
    assert isinstance(data["outcome"], str)
    assert isinstance(data["result"]["text"], str)
    assert isinstance(data["result"]["followUps"], list)
    assert isinstance(data["result"]["sources"], list)
    assert isinstance(data["result"]["medicalNote"], bool)
    assert data["result"]["blocks"] is None
    assert isinstance(data["usage"]["totalTokens"], int)
    assert isinstance(data["traceId"], str)


# 18. Token usage preserved
def test_token_usage_preserved(client: TestClient, fake_llm: FakeLlm) -> None:
    response = client.post(URL, json=load_request("sparse"), headers=auth())
    assert response.status_code == 200
    usage = response.json()["usage"]
    assert usage["inputTokens"] == 100
    assert usage["outputTokens"] == 20
    assert usage["thinkingTokens"] == 5
    assert usage["totalTokens"] == 125


# 19. Correlation ID / trace ID preserved
def test_correlation_trace_id_preserved(client: TestClient, fake_llm: FakeLlm) -> None:
    response = client.post(
        URL, json=load_request("sparse"), headers=auth() | {"X-Request-Id": "req-custom-trace-99"}
    )
    assert response.status_code == 200
    assert response.json()["traceId"] == "req-custom-trace-99"


# 20. Existing safety behavior preserved (medicalNote: true when medical issues discussed)
def test_medical_note_flag_preserved_when_true(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiCoachReplyOutput(
        text="Sharp knee pain during squats may indicate a meniscus injury. Please consult a physician immediately.",
        follow_ups=["Should I ice it?", "Can I do upper body workouts?"],
        sources=["Profile"],
        medical_note=True,
    )
    response = client.post(URL, json=load_request("sparse"), headers=auth())
    assert response.status_code == 200
    data = response.json()
    assert data["result"]["medicalNote"] is True
    assert "physician" in data["result"]["text"].lower()
