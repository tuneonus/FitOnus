import base64
import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from conftest import FakeLlm, make_token
from onusfit_ai.core.errors import AiError
from onusfit_ai.llm.gemini import get_llm
from onusfit_ai.main import create_app

URL = "/internal/v1/ai/speech/transcribe"
MODEL = {"primary": "gemini-primary", "fallback": "gemini-backup"}
CLIP = b"\x00\x01fake-m4a-bytes"
GOOD_REPLY = json.dumps(
    {"transcript": "inniku leg workout mudichiten", "detectedLanguage": "tanglish"}
)


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


@pytest.fixture
def stt(fake_llm: FakeLlm) -> FakeLlm:
    fake_llm.text = GOOD_REPLY
    return fake_llm


def test_success_returns_the_public_shape_and_sends_the_clip(
    client: TestClient, stt: FakeLlm
) -> None:
    response = client.post(URL, json=body(), headers=auth() | {"X-Request-Id": "rid-7"})

    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == "ok" and data["traceId"] == "rid-7"
    assert data["result"] == {
        "transcript": "inniku leg workout mudichiten",
        "detectedLanguage": "tanglish",
    }
    assert data["usage"]["model"] == "gemini-primary"
    call = stt.calls[0]
    assert (call["primary"], call["fallback"], call["deadline_s"]) == (
        "gemini-primary",
        "gemini-backup",
        23.5,
    )
    assert (call["media"].mime_type, call["media"].data) == ("audio/m4a", CLIP)
    assert "speech-to-text transcriber" in call["prompt"]


def test_data_url_audio_is_accepted(client: TestClient, stt: FakeLlm) -> None:
    payload = body(
        audio={
            "mimeType": "audio/webm",
            "base64": "data:audio/webm;base64," + base64.b64encode(CLIP).decode(),
        }
    )
    assert client.post(URL, json=payload, headers=auth()).status_code == 200
    assert stt.calls[0]["media"].data == CLIP


@pytest.mark.parametrize(
    "mime",
    [
        "audio/m4a",
        "audio/x-m4a",
        "audio/mp4; codecs=mp4a.40.2",
        "audio/wav",
        "audio/webm",
        "audio/ogg",
        "audio/mpeg",
        "audio/aac",
        "audio/3gpp",
    ],
)
def test_supported_formats_are_accepted(client: TestClient, stt: FakeLlm, mime: str) -> None:
    payload = body(audio={"mimeType": mime, "base64": "QQ=="})
    assert client.post(URL, json=payload, headers=auth()).status_code == 200


@pytest.mark.parametrize(
    "mime", ["audio/flac", "video/quicktime", "image/png", "text/plain", "application/octet-stream"]
)
def test_unsupported_formats_are_rejected_before_gemini(
    client: TestClient, stt: FakeLlm, mime: str
) -> None:
    payload = body(audio={"mimeType": mime, "base64": "QQ=="})
    response = client.post(URL, json=payload, headers=auth())
    assert response.status_code == 422
    assert "audio.mimeType" in [f["field"] for f in response.json()["error"]["fields"]]
    assert stt.calls == []


def test_audio_over_15mb_is_rejected_before_gemini(client: TestClient, stt: FakeLlm) -> None:
    payload = body(audio={"mimeType": "audio/m4a", "base64": "A" * (15 * 1024 * 1024 + 1)})
    response = client.post(URL, json=payload, headers=auth())
    assert response.status_code == 422
    assert stt.calls == []


def test_audio_exactly_at_the_limit_is_accepted(client: TestClient, stt: FakeLlm) -> None:
    payload = body(audio={"mimeType": "audio/m4a", "base64": "A" * (15 * 1024 * 1024)})
    assert client.post(URL, json=payload, headers=auth()).status_code == 200


def test_invalid_base64_is_a_422_that_never_calls_gemini(client: TestClient, stt: FakeLlm) -> None:
    payload = body(audio={"mimeType": "audio/m4a", "base64": "a,b"})
    response = client.post(URL, json=payload, headers=auth())
    assert response.status_code == 422
    assert response.json()["error"]["message"] == "Audio data is not valid base64."
    assert stt.calls == []


@pytest.mark.parametrize(
    "mutate",
    [
        lambda b: b.pop("audio"),
        lambda b: b["audio"].update(base64=""),
        lambda b: b["audio"].update(mimeType=""),
        lambda b: b.update(deadlineMs=10),
        lambda b: b.update(userId="someone"),
        lambda b: b.update(transcript="not accepted here"),
        lambda b: b.update(model={"primary": "bad name!"}),
    ],
)
def test_invalid_requests_are_rejected_without_echoing_input(
    client: TestClient, stt: FakeLlm, mutate: Any
) -> None:
    payload = body()
    payload["audio"]["base64"] = base64.b64encode(b"SECRET-AUDIO-PAYLOAD").decode()
    mutate(payload)
    response = client.post(URL, json=payload, headers=auth())
    assert response.status_code == 422
    assert "SECRET-AUDIO-PAYLOAD" not in response.text
    assert base64.b64encode(b"SECRET-AUDIO-PAYLOAD").decode() not in response.text
    assert stt.calls == []


def test_other_scopes_are_refused(client: TestClient, stt: FakeLlm) -> None:
    for scope in ("ai:coach:chat", "ai:meals:voice"):
        assert client.post(URL, json=body(), headers=auth(scope=scope)).status_code == 401
    assert stt.calls == []


def test_missing_token_is_rejected(client: TestClient) -> None:
    assert client.post(URL, json=body()).status_code == 401


def test_unusable_reply_becomes_the_transcript_and_is_flagged(
    client: TestClient, stt: FakeLlm
) -> None:
    stt.text = "inniku leg day pannen"
    data = client.post(URL, json=body(), headers=auth()).json()
    assert data["outcome"] == "unstructured"
    assert data["result"] == {"transcript": "inniku leg day pannen", "detectedLanguage": "en"}


def test_gemini_errors_become_structured_json(fake_llm: FakeLlm) -> None:
    fake_llm.error = AiError(
        status_code=429,
        code="PROVIDER_RATE_LIMITED",
        message="slow down",
        retry_after_seconds=25,
        dispatched=True,
    )
    app = create_app()
    app.dependency_overrides[get_llm] = lambda: fake_llm
    response = TestClient(app).post(URL, json=body(), headers=auth())
    assert response.status_code == 429
    assert response.json()["error"] == {
        "code": "PROVIDER_RATE_LIMITED",
        "message": "slow down",
        "dispatched": True,
        "retryAfterSeconds": 25,
    }


def test_audio_and_transcript_are_never_logged(
    client: TestClient, stt: FakeLlm, caplog: pytest.LogCaptureFixture
) -> None:
    stt.text = json.dumps({"transcript": "PRIVATE-SPOKEN-WORDS", "detectedLanguage": "en"})
    private_audio = base64.b64encode(b"PRIVATE-AUDIO-BYTES").decode()
    with caplog.at_level("DEBUG"):
        response = client.post(
            URL, json=body(audio={"mimeType": "audio/m4a", "base64": private_audio}), headers=auth()
        )
    assert response.status_code == 200
    logged = "\n".join(r.getMessage() for r in caplog.records)
    assert "transcribe" in logged
    for private in ("PRIVATE-SPOKEN-WORDS", "PRIVATE-AUDIO-BYTES", private_audio):
        assert private not in logged
