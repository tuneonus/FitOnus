"""Tests for failed provider usage telemetry propagation (Phase 1 / WP1).

Verifies that when Gemini calls fail due to SAFETY, MAX_TOKENS, or malformed structured output,
the Python backend's exception handlers capture the provider usage metadata and serialize
it into the camelCase 503 HTTP error payload, enabling Node.js to record the consumed tokens
even when user generation failed.
"""

import base64
import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from conftest import INSIGHTS_FIXTURES, FakeLlm, load_request, make_token

MODEL = {"primary": "gemini-primary", "fallback": "gemini-backup"}
JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF-fake-photo-bytes"
PROMPT_CASES = json.loads((INSIGHTS_FIXTURES / "prompt_cases.json").read_text(encoding="utf-8"))
INSIGHTS_CONTEXT: dict[str, Any] = next(c for c in PROMPT_CASES if c["name"] == "A_full__en")["context"]


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def test_coach_chat_safety_error_serializes_usage(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.finish_reason = "SAFETY"
    response = client.post(
        "/internal/v1/ai/coach/chat",
        json=load_request("sparse"),
        headers={"Authorization": f"Bearer {make_token(scope='ai:coach:chat')}"},
    )
    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "PROVIDER_UNAVAILABLE"
    assert error["dispatched"] is True
    assert "usage" in error
    assert error["usage"]["inputTokens"] == 100
    assert error["usage"]["outputTokens"] == 20
    assert error["usage"]["totalTokens"] == 125
    assert error["usage"]["model"] == "gemini-3.5-flash-lite"


def test_coach_chat_max_tokens_error_serializes_usage(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.finish_reason = "MAX_TOKENS"
    response = client.post(
        "/internal/v1/ai/coach/chat",
        json=load_request("sparse"),
        headers={"Authorization": f"Bearer {make_token(scope='ai:coach:chat')}"},
    )
    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "PROVIDER_ERROR"
    assert error["dispatched"] is True
    assert "usage" in error
    assert error["usage"]["totalTokens"] == 125


def test_coach_chat_malformed_structured_error_serializes_usage(
    client: TestClient, fake_llm: FakeLlm
) -> None:
    fake_llm.text = "NOT JSON AT ALL"
    fake_llm.parsed = None
    response = client.post(
        "/internal/v1/ai/coach/chat",
        json=load_request("sparse"),
        headers={"Authorization": f"Bearer {make_token(scope='ai:coach:chat')}"},
    )
    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "PROVIDER_ERROR"
    assert error["dispatched"] is True
    assert "usage" in error
    assert error["usage"]["totalTokens"] == 125


def test_coach_insights_safety_error_serializes_usage(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.finish_reason = "SAFETY"
    response = client.post(
        "/internal/v1/ai/coach/insights",
        json={"context": INSIGHTS_CONTEXT, "lang": "en", "model": MODEL, "deadlineMs": 10000},
        headers={"Authorization": f"Bearer {make_token(scope='ai:coach:insights')}"},
    )
    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "PROVIDER_UNAVAILABLE"
    assert error["dispatched"] is True
    assert "usage" in error
    assert error["usage"]["totalTokens"] == 125


def test_voice_meal_safety_error_serializes_usage(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.finish_reason = "SAFETY"
    response = client.post(
        "/internal/v1/ai/meals/parse-voice",
        json={"transcript": "dosa", "model": MODEL, "deadlineMs": 10000},
        headers={"Authorization": f"Bearer {make_token(scope='ai:meals:voice')}"},
    )
    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "PROVIDER_UNAVAILABLE"
    assert error["dispatched"] is True
    assert "usage" in error
    assert error["usage"]["totalTokens"] == 125


def test_voice_meal_max_tokens_error_serializes_usage(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.finish_reason = "MAX_TOKENS"
    response = client.post(
        "/internal/v1/ai/meals/parse-voice",
        json={"transcript": "dosa", "model": MODEL, "deadlineMs": 10000},
        headers={"Authorization": f"Bearer {make_token(scope='ai:meals:voice')}"},
    )
    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "PROVIDER_ERROR"
    assert error["dispatched"] is True
    assert "usage" in error
    assert error["usage"]["totalTokens"] == 125


def test_meal_photo_safety_error_serializes_usage(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.finish_reason = "SAFETY"
    response = client.post(
        "/internal/v1/ai/meals/analyze-photo",
        json={
            "image": {"mimeType": "image/jpeg", "base64": b64(JPEG)},
            "model": MODEL,
            "deadlineMs": 10000,
        },
        headers={"Authorization": f"Bearer {make_token(scope='ai:meals:photo')}"},
    )
    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "PROVIDER_UNAVAILABLE"
    assert error["dispatched"] is True
    assert "usage" in error
    assert error["usage"]["totalTokens"] == 125


def test_meal_photo_max_tokens_error_serializes_usage(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.finish_reason = "MAX_TOKENS"
    response = client.post(
        "/internal/v1/ai/meals/analyze-photo",
        json={
            "image": {"mimeType": "image/jpeg", "base64": b64(JPEG)},
            "model": MODEL,
            "deadlineMs": 10000,
        },
        headers={"Authorization": f"Bearer {make_token(scope='ai:meals:photo')}"},
    )
    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "PROVIDER_ERROR"
    assert error["dispatched"] is True
    assert "usage" in error
    assert error["usage"]["totalTokens"] == 125


def test_speech_transcribe_safety_error_serializes_usage(
    client: TestClient, fake_llm: FakeLlm
) -> None:
    fake_llm.finish_reason = "SAFETY"
    response = client.post(
        "/internal/v1/ai/speech/transcribe",
        json={
            "audio": {"mimeType": "audio/m4a", "base64": b64(b"audio-clip")},
            "model": MODEL,
            "deadlineMs": 10000,
        },
        headers={"Authorization": f"Bearer {make_token(scope='ai:speech:transcribe')}"},
    )
    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "PROVIDER_UNAVAILABLE"
    assert error["dispatched"] is True
    assert "usage" in error
    assert error["usage"]["totalTokens"] == 125


def test_error_without_usage_omits_usage_field(client: TestClient, fake_llm: FakeLlm) -> None:
    # Simulates an error raised before usage is obtained (e.g. invalid request or pre-call error)
    response = client.post(
        "/internal/v1/ai/coach/chat",
        json={"message": "", "context": {}, "model": MODEL, "deadlineMs": 10000},
        headers={"Authorization": f"Bearer {make_token(scope='ai:coach:chat')}"},
    )
    assert response.status_code == 422
    error = response.json()["error"]
    assert "usage" not in error
