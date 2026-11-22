"""Tests for AI Coach Memory Extraction service and API endpoint."""

import pytest
from fastapi.testclient import TestClient

from conftest import FakeLlm, make_token
from onusfit_ai.features.coach.application.extraction import extract_coach_memories
from onusfit_ai.features.coach.application.prompts.memory_extraction import (
    build_memory_extraction_prompt,
)
from onusfit_ai.features.coach.domain.chat import ChatTurn
from onusfit_ai.features.coach.domain.memory import (
    ExtractedMemoryCandidate,
    GeminiMemoryExtractionOutput,
    MemoryExtractionRequest,
)
from onusfit_ai.shared.contracts.common import ModelSelection
from onusfit_ai.shared.llm.errors import LlmServiceError

URL = "/internal/v1/ai/coach/memories/extract"


def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token()}"}


def sample_request() -> dict:
    return {
        "turns": [
            {"role": "user", "text": "I cannot do overhead press because my right shoulder aches."},
            {"role": "assistant", "text": "Understood, we will substitute lateral raises instead."},
            {"role": "user", "text": "Also I prefer working out at 6am before work."},
        ],
        "existingMemories": ["Lacto-vegetarian diet"],
        "model": {"primary": "gemini-2.5-flash-lite", "fallback": "gemini-2.5-flash"},
        "deadlineMs": 15000,
    }


def test_build_memory_extraction_prompt_structure() -> None:
    turns = [
        ChatTurn(role="user", text="Naan kaalaila 6 manikku gym poven."),
        ChatTurn(role="assistant", text="Super, morning workouts boost focus."),
    ]
    prompt = build_memory_extraction_prompt(turns, existing_memories=["No red meat"])

    assert "KNOWN EXISTING USER MEMORIES (DO NOT DUPLICATE):" in prompt
    assert "- No red meat" in prompt
    assert "<conversation>" in prompt
    assert "[USER]: Naan kaalaila 6 manikku gym poven." in prompt
    assert "[COACH]: Super, morning workouts boost focus." in prompt
    assert "</conversation>" in prompt
    assert "MULTILINGUAL SUPPORT (ENGLISH, TAMIL & TANGLISH)" in prompt


@pytest.mark.asyncio
async def test_extract_coach_memories_service(fake_llm: FakeLlm) -> None:
    mock_candidate = ExtractedMemoryCandidate(
        category="injuries",
        text="Right shoulder pain prevents overhead pressing",
        confidence=0.95,
        sensitive=True,
        source_quote="I cannot do overhead press because my right shoulder aches.",
    )
    fake_llm.parsed = GeminiMemoryExtractionOutput(candidates=[mock_candidate])

    request = MemoryExtractionRequest(
        turns=[ChatTurn(role="user", text="I cannot do overhead press because my right shoulder aches.")],
        existing_memories=[],
        model=ModelSelection(primary="gemini-2.5-flash-lite", fallback="gemini-2.5-flash"),
        deadline_ms=15000,
    )

    response = await extract_coach_memories(request, fake_llm, trace_id="trace-test-1")

    assert len(response.candidates) == 1
    assert response.candidates[0].category == "injuries"
    assert response.candidates[0].sensitive is True
    assert response.candidates[0].confidence == 0.95
    assert response.trace_id == "trace-test-1"


@pytest.mark.asyncio
async def test_extract_coach_memories_enforces_sensitivity(fake_llm: FakeLlm) -> None:
    # Model hallucinated sensitive=False for an injury category
    mock_candidate = ExtractedMemoryCandidate(
        category="injuries",
        text="Severe knee pain on squats",
        confidence=0.90,
        sensitive=False,  # Wrongly set by model
        source_quote="My knee hurts",
    )
    fake_llm.parsed = GeminiMemoryExtractionOutput(candidates=[mock_candidate])

    request = MemoryExtractionRequest(
        turns=[ChatTurn(role="user", text="My knee hurts on squats")],
        existing_memories=[],
        model=ModelSelection(primary="gemini-2.5-flash-lite", fallback="gemini-2.5-flash"),
        deadline_ms=15000,
    )

    response = await extract_coach_memories(request, fake_llm, trace_id="trace-test-2")

    # Guardrail must enforce sensitive=True
    assert response.candidates[0].sensitive is True


@pytest.mark.asyncio
async def test_extract_coach_memories_safety_block_raises(fake_llm: FakeLlm) -> None:
    fake_llm.finish_reason = "SAFETY"

    request = MemoryExtractionRequest(
        turns=[ChatTurn(role="user", text="unsafe statement")],
        existing_memories=[],
        model=ModelSelection(primary="gemini-2.5-flash-lite", fallback=None),
        deadline_ms=15000,
    )

    with pytest.raises(LlmServiceError) as exc_info:
        await extract_coach_memories(request, fake_llm, trace_id="trace-safety")

    assert exc_info.value.code == "PROVIDER_UNAVAILABLE"


def test_memory_extraction_api_endpoint_success(client: TestClient, fake_llm: FakeLlm) -> None:
    mock_candidate = ExtractedMemoryCandidate(
        category="workout",
        text="Prefers training early at 6 AM",
        confidence=0.92,
        sensitive=False,
        source_quote="I prefer working out at 6am before work.",
    )
    fake_llm.parsed = GeminiMemoryExtractionOutput(candidates=[mock_candidate])

    response = client.post(
        URL,
        json=sample_request(),
        headers=auth() | {"X-Request-Id": "req-mem-123"},
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data["candidates"]) == 1
    assert data["candidates"][0]["category"] == "workout"
    assert data["candidates"][0]["text"] == "Prefers training early at 6 AM"
    assert data["candidates"][0]["sensitive"] is False
    assert data["traceId"] == "req-mem-123"


def test_memory_extraction_api_requires_auth(client: TestClient) -> None:
    response = client.post(URL, json=sample_request())
    assert response.status_code == 401
