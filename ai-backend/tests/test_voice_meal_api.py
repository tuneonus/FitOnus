import base64
import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from conftest import FakeLlm, make_token
from onusfit_ai.main import create_app
from onusfit_ai.shared.errors import AiError
from onusfit_ai.shared.llm.dependencies import get_llm

URL = "/internal/v1/ai/meals/parse-voice"
MODEL = {"primary": "gemini-primary", "fallback": "gemini-backup"}

GOOD_REPLY = json.dumps(
    {
        "transcript": "two dosa and sambar",
        "detectedLanguage": "en",
        "confidence": "high",
        "unclearReason": None,
        "items": [
            {
                "name": "Dosa",
                "portionDescription": "2 pieces",
                "servingWeightG": 160,
                "servingUnit": "piece",
                "servingSize": 2,
                "calories": 260,
                "proteinG": 6,
                "carbsG": 44,
                "fatG": 7,
                "fiberG": 2,
                "confidence": "high",
            },
        ],
    }
)


def auth(scope: str = "ai:meals:voice") -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(scope=scope)}"}


def body(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "transcript": "two dosa and sambar",
        "model": MODEL,
        "deadlineMs": 20000,
    }
    base.update(overrides)
    return {k: v for k, v in base.items() if v is not None}


@pytest.fixture
def voice_llm(fake_llm: FakeLlm) -> FakeLlm:
    fake_llm.text = GOOD_REPLY
    return fake_llm


def test_text_path_returns_items_in_camel_case(client: TestClient, voice_llm: FakeLlm) -> None:
    response = client.post(
        URL, json=body(lang="en", mealType="dinner"), headers=auth() | {"X-Request-Id": "rid-9"}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == "ok"
    assert data["traceId"] == "rid-9"
    result = data["result"]
    assert (result["totalKcal"], result["detectedLanguage"], result["confidence"]) == (
        260,
        "en",
        "high",
    )
    item = result["items"][0]
    assert (item["name"], item["kcal"], item["brand"], item["isAiEstimated"]) == (
        "Dosa",
        260,
        "AI Voice Estimate",
        True,
    )
    assert item["servingWeightG"] == 160 and item["servingUnit"] == "piece"
    assert data["usage"]["totalTokens"] == 125
    call = voice_llm.calls[0]
    assert (call["primary"], call["fallback"], call["deadline_s"], call["media"]) == (
        "gemini-primary",
        "gemini-backup",
        20.0,
        None,
    )
    assert 'Spoken or input text: "two dosa and sambar"' in call["prompt"]
    assert "Assumed meal category: dinner" in call["prompt"]


def test_audio_path_decodes_base64_and_sends_the_clip(
    client: TestClient, voice_llm: FakeLlm
) -> None:
    clip = b"\x00\x01fake-m4a-bytes"
    payload = body(
        transcript=None, audio={"mimeType": "audio/m4a", "base64": base64.b64encode(clip).decode()}
    )

    response = client.post(URL, json=payload, headers=auth())

    assert response.status_code == 200
    media = voice_llm.calls[0]["media"]
    assert (media.mime_type, media.data) == ("audio/m4a", clip)
    assert "Spoken or input text" not in voice_llm.calls[0]["prompt"]  # no transcript supplied


def test_audio_data_url_prefix_is_accepted(client: TestClient, voice_llm: FakeLlm) -> None:
    clip = b"abc123"
    data_url = "data:audio/webm;base64," + base64.b64encode(clip).decode()
    client.post(
        URL,
        json=body(transcript=None, audio={"mimeType": "audio/webm", "base64": data_url}),
        headers=auth(),
    )
    assert voice_llm.calls[0]["media"].data == clip


def test_audio_and_transcript_can_be_sent_together(client: TestClient, voice_llm: FakeLlm) -> None:
    payload = body(audio={"mimeType": "audio/mp4", "base64": base64.b64encode(b"x").decode()})
    assert client.post(URL, json=payload, headers=auth()).status_code == 200
    call = voice_llm.calls[0]
    assert (
        call["media"] is not None
        and 'Spoken or input text: "two dosa and sambar"' in call["prompt"]
    )


def test_invalid_base64_audio_is_a_422_that_never_calls_gemini(
    client: TestClient, voice_llm: FakeLlm
) -> None:
    payload = body(
        transcript=None, audio={"mimeType": "audio/m4a", "base64": "a,b"}
    )  # payload after the comma: "b"
    response = client.post(URL, json=payload, headers=auth())
    assert response.status_code == 422
    assert response.json()["error"] == {
        "code": "INVALID_REQUEST",
        "message": "Audio data is not valid base64.",
        "dispatched": False,
    }
    assert voice_llm.calls == []


@pytest.mark.parametrize(
    "mutate",
    [
        lambda b: b.pop("transcript"),  # neither transcript nor audio
        lambda b: b.update(transcript="   "),  # blank transcript, no audio
        lambda b: b.update(transcript="x" * 2001),
        lambda b: b.update(lang="x" * 51),
        lambda b: b.update(deadlineMs=5),
        lambda b: b.update(userId="someone"),  # identity is never accepted from the body
        lambda b: b.update(audio={"mimeType": "", "base64": "QQ=="}),
        lambda b: b.update(model={"primary": "bad name!"}),
    ],
)
def test_invalid_requests_are_rejected_without_echoing_input(
    client: TestClient, voice_llm: FakeLlm, mutate: Any
) -> None:
    payload = body(transcript="SECRET-MEAL-TEXT")
    mutate(payload)
    response = client.post(URL, json=payload, headers=auth())
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_REQUEST"
    assert "SECRET-MEAL-TEXT" not in response.text
    assert voice_llm.calls == []


def test_a_chat_scoped_token_cannot_call_the_voice_endpoint(
    client: TestClient, voice_llm: FakeLlm
) -> None:
    response = client.post(URL, json=body(), headers=auth(scope="ai:coach:chat"))
    assert response.status_code == 401
    assert voice_llm.calls == []


def test_missing_token_is_rejected(client: TestClient) -> None:
    assert client.post(URL, json=body()).status_code == 401


def test_unusable_model_reply_is_flagged_not_hidden(client: TestClient, voice_llm: FakeLlm) -> None:
    voice_llm.text = "Sure! That is about 300 kcal."
    data = client.post(URL, json=body(), headers=auth()).json()
    assert data["outcome"] == "parse_failed"
    assert data["result"]["items"] == []
    assert (
        data["result"]["unclearReason"]
        == "AI response was not formatted correctly. Please try again."
    )
    assert (
        data["result"]["transcript"] == "two dosa and sambar"
    )  # falls back to what the user typed


def test_no_food_reply_is_flagged(client: TestClient, voice_llm: FakeLlm) -> None:
    voice_llm.text = json.dumps({"items": [], "unclearReason": "No food mentioned."})
    data = client.post(URL, json=body(transcript="hello"), headers=auth()).json()
    assert (data["outcome"], data["result"]["unclearReason"]) == ("no_food", "No food mentioned.")


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
    response = TestClient(app).post(URL, json=body(), headers=auth())
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "PROVIDER_RATE_LIMITED"


def test_transcript_audio_and_reply_are_never_logged(
    client: TestClient, voice_llm: FakeLlm, caplog: pytest.LogCaptureFixture
) -> None:
    voice_llm.text = GOOD_REPLY.replace("two dosa and sambar", "PRIVATE-REPLY-TEXT")
    payload = body(
        transcript="PRIVATE-MEAL-TRANSCRIPT",
        audio={"mimeType": "audio/m4a", "base64": base64.b64encode(b"PRIVATE-AUDIO").decode()},
    )
    with caplog.at_level("DEBUG"):
        assert client.post(URL, json=payload, headers=auth()).status_code == 200
    logged = "\n".join(r.getMessage() for r in caplog.records)
    assert "voice_meal" in logged
    for private in (
        "PRIVATE-MEAL-TRANSCRIPT",
        "PRIVATE-REPLY-TEXT",
        "PRIVATE-AUDIO",
        base64.b64encode(b"PRIVATE-AUDIO").decode(),
    ):
        assert private not in logged
