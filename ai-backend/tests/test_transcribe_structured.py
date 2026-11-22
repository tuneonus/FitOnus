"""Tests for Gemini Native Structured Outputs in speech transcription (Phase 1 / Stage 1)."""

import base64
import json
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from conftest import FakeLlm, make_token
from onusfit_ai.features.speech.application.contracts import TranscribeRequest
from onusfit_ai.features.speech.application.schemas import GeminiTranscribeOutput
from onusfit_ai.features.speech.application.transcribe import (
    is_speech_structured_output_enabled,
    transcribe_audio,
)
from onusfit_ai.shared.llm.gemini import GeminiClient
from onusfit_ai.shared.llm.ports import LlmServiceError

URL = "/internal/v1/ai/speech/transcribe"
MODEL = {"primary": "gemini-primary", "fallback": "gemini-backup"}
CLIP = b"\x00\x01fake-audio-bytes"


def auth(scope: str = "ai:speech:transcribe") -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(scope=scope)}"}


def body(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "audio": {"mimeType": "audio/m4a", "base64": base64.b64encode(CLIP).decode()},
        "model": MODEL,
        "deadlineMs": 23500,
    }
    base.update(overrides)
    return base


def test_successful_structured_transcription(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiTranscribeOutput(
        transcript="Finished 5km morning run", detected_language="en"
    )
    fake_llm.text = '{"transcript": "Finished 5km morning run", "detectedLanguage": "en"}'

    response = client.post(URL, json=body(), headers=auth())

    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == "ok"
    assert data["result"]["transcript"] == "Finished 5km morning run"
    assert data["result"]["detectedLanguage"] == "en"
    assert fake_llm.calls[0]["schema"] is GeminiTranscribeOutput


def test_tamil_script_structured_transcription(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiTranscribeOutput(
        transcript="இன்று காலை 5 கி.மீ ஓடினேன்", detected_language="ta"
    )
    fake_llm.text = '{"transcript": "இன்று காலை 5 கி.மீ ஓடினேன்", "detectedLanguage": "ta"}'

    response = client.post(URL, json=body(), headers=auth())

    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == "ok"
    assert data["result"]["transcript"] == "இன்று காலை 5 கி.மீ ஓடினேன்"
    assert data["result"]["detectedLanguage"] == "ta"


def test_tanglish_structured_transcription(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiTranscribeOutput(
        transcript="inniku leg workout mudichiten", detected_language="tanglish"
    )
    fake_llm.text = (
        '{"transcript": "inniku leg workout mudichiten", "detectedLanguage": "tanglish"}'
    )

    response = client.post(URL, json=body(), headers=auth())

    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == "ok"
    assert data["result"]["transcript"] == "inniku leg workout mudichiten"
    assert data["result"]["detectedLanguage"] == "tanglish"


def test_english_structured_transcription(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiTranscribeOutput(
        transcript="Bench pressed 100kg for 5 reps", detected_language="en"
    )
    fake_llm.text = '{"transcript": "Bench pressed 100kg for 5 reps", "detectedLanguage": "en"}'

    response = client.post(URL, json=body(), headers=auth())

    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == "ok"
    assert data["result"]["transcript"] == "Bench pressed 100kg for 5 reps"
    assert data["result"]["detectedLanguage"] == "en"


def test_camel_case_field_serialization() -> None:
    item = GeminiTranscribeOutput(transcript="hello", detected_language="ta")
    dumped = item.model_dump(by_alias=True)
    assert "detectedLanguage" in dumped
    assert dumped["detectedLanguage"] == "ta"
    assert "detected_language" not in dumped


def test_safety_blocked_response_raises_provider_unavailable(fake_llm: FakeLlm) -> None:
    fake_llm.finish_reason = "SAFETY"
    fake_llm.parsed = None
    fake_llm.text = ""

    req = TranscribeRequest.model_validate(body())
    with pytest.raises(LlmServiceError) as exc_info:
        import asyncio

        asyncio.run(transcribe_audio(req, fake_llm, trace_id="test-trace"))

    err = exc_info.value
    assert err.code == "PROVIDER_UNAVAILABLE"
    assert "safety" in err.message.lower()
    assert err.dispatched is True


def test_max_tokens_truncated_response_raises_provider_error(fake_llm: FakeLlm) -> None:
    fake_llm.finish_reason = "MAX_TOKENS"
    fake_llm.parsed = None
    fake_llm.text = '{"transcript": "halfway thr'

    req = TranscribeRequest.model_validate(body())
    with pytest.raises(LlmServiceError) as exc_info:
        import asyncio

        asyncio.run(transcribe_audio(req, fake_llm, trace_id="test-trace"))

    err = exc_info.value
    assert err.code == "PROVIDER_ERROR"
    assert "token" in err.message.lower()
    assert err.dispatched is True


def test_missing_parsed_falls_back_to_safe_legacy_parser(
    client: TestClient, fake_llm: FakeLlm
) -> None:
    fake_llm.parsed = None
    fake_llm.finish_reason = "STOP"
    fake_llm.text = "inniku leg day pannen, romba tired"

    response = client.post(URL, json=body(), headers=auth())

    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == "unstructured"
    assert data["result"]["transcript"] == "inniku leg day pannen, romba tired"
    assert data["result"]["detectedLanguage"] == "en"


def test_pydantic_validation_failure_falls_back_safely(
    client: TestClient, fake_llm: FakeLlm
) -> None:
    # Model returned invalid language code that fails GeminiTranscribeOutput Literal validation
    fake_llm.parsed = None
    fake_llm.finish_reason = "STOP"
    fake_llm.text = json.dumps({"transcript": "running", "detectedLanguage": "french"})

    response = client.post(URL, json=body(), headers=auth())

    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == "ok"
    assert data["result"]["transcript"] == "running"
    # Legacy parser accepts raw string as detectedLanguage
    assert data["result"]["detectedLanguage"] == "french"


def test_feature_rollback_toggle_via_env(
    client: TestClient, fake_llm: FakeLlm, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("AI_SPEECH_STRUCTURED_OUTPUTS", "false")
    assert not is_speech_structured_output_enabled()

    fake_llm.text = json.dumps({"transcript": "rollback test", "detectedLanguage": "en"})
    response = client.post(URL, json=body(), headers=auth())

    assert response.status_code == 200
    assert fake_llm.calls[0]["schema"] is None


@pytest.mark.asyncio
async def test_gemini_client_passes_schema_and_mime_type() -> None:
    configs_received: list[Any] = []

    class FakeSdk:
        def __init__(self) -> None:
            self.aio = SimpleNamespace(models=SimpleNamespace(generate_content=self._generate))

        async def _generate(self, *, model: str, contents: Any, config: Any) -> Any:
            configs_received.append(config)
            meta = SimpleNamespace(
                prompt_token_count=10,
                candidates_token_count=5,
                cached_content_token_count=0,
                thoughts_token_count=0,
                total_token_count=15,
            )
            parsed_inst = GeminiTranscribeOutput(transcript="test", detected_language="en")
            cand = SimpleNamespace(finish_reason=SimpleNamespace(name="STOP"))
            return SimpleNamespace(
                text='{"transcript": "test", "detectedLanguage": "en"}',
                parsed=parsed_inst,
                candidates=[cand],
                usage_metadata=meta,
            )

    client = GeminiClient(api_key="fake-key", sdk_client=FakeSdk())

    result = await client.generate_text(
        "test prompt",
        primary_model="gemini-2.5-flash",
        fallback_model="gemini-2.5-flash-lite",
        deadline_s=10.0,
        schema=GeminiTranscribeOutput,
    )

    assert len(configs_received) == 1
    cfg = configs_received[0]
    assert cfg.response_mime_type == "application/json"
    assert cfg.response_schema is GeminiTranscribeOutput
    assert result.parsed == GeminiTranscribeOutput(transcript="test", detected_language="en")
    assert result.finish_reason == "STOP"


@pytest.mark.asyncio
async def test_gemini_client_passes_schema_to_fallback_model() -> None:
    calls: list[tuple[str, Any]] = []

    class FakeSdkFallback:
        def __init__(self) -> None:
            self.aio = SimpleNamespace(models=SimpleNamespace(generate_content=self._generate))

        async def _generate(self, *, model: str, contents: Any, config: Any) -> Any:
            calls.append((model, config))
            if model == "primary-model":
                from google.genai import errors as genai_errors

                raise genai_errors.ServerError(
                    503, {"error": {"code": 503, "message": "busy", "status": "UNAVAILABLE"}}
                )
            meta = SimpleNamespace(
                prompt_token_count=10,
                candidates_token_count=5,
                cached_content_token_count=0,
                thoughts_token_count=0,
                total_token_count=15,
            )
            cand = SimpleNamespace(finish_reason=SimpleNamespace(name="STOP"))
            return SimpleNamespace(
                text='{"transcript": "fallback", "detectedLanguage": "en"}',
                parsed=GeminiTranscribeOutput(transcript="fallback", detected_language="en"),
                candidates=[cand],
                usage_metadata=meta,
            )

    client = GeminiClient(api_key="fake-key", sdk_client=FakeSdkFallback())

    result = await client.generate_text(
        "test prompt",
        primary_model="primary-model",
        fallback_model="backup-model",
        deadline_s=10.0,
        schema=GeminiTranscribeOutput,
    )

    assert len(calls) == 2
    assert calls[0][0] == "primary-model"
    assert calls[0][1].response_schema is GeminiTranscribeOutput
    assert calls[1][0] == "backup-model"
    assert calls[1][1].response_schema is GeminiTranscribeOutput
    assert result.text == '{"transcript": "fallback", "detectedLanguage": "en"}'
    assert result.parsed == GeminiTranscribeOutput(transcript="fallback", detected_language="en")
