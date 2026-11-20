"""Audio/image helper errors: no HTTP in the helpers, and the same 422 on the wire.

Regression tests for two audit findings:
  * M3: the helpers (called from the use cases) raise a plain `InvalidMediaError`, not an HTTP error;
    the error handler turns it into the 422 `INVALID_REQUEST` (`dispatched=false`) Node already knew.
  * M2: audio that decodes to nothing (`"!!!!"`, an empty data URL) used to be sent to Gemini, billed
    and answered with a 503. It is now refused before any Gemini call.
"""

import base64

import pytest
from fastapi.testclient import TestClient

from conftest import FakeLlm, make_token
from onusfit_ai.shared.utils.audio import decode_audio_base64
from onusfit_ai.shared.utils.image import decode_image_base64
from onusfit_ai.shared.utils.media import InvalidMediaError

CLIP = b"\x00\x01fake-m4a-bytes"
GOOD_B64 = base64.b64encode(CLIP).decode()

STT_URL = "/internal/v1/ai/speech/transcribe"
VOICE_URL = "/internal/v1/ai/meals/parse-voice"
PHOTO_URL = "/internal/v1/ai/meals/analyze-photo"

MODEL = {"primary": "gemini-primary", "fallback": None}


def auth(scope: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(scope=scope)}"}


def test_helpers_raise_a_plain_value_error_not_an_http_error() -> None:
    assert issubclass(InvalidMediaError, ValueError)
    with pytest.raises(InvalidMediaError):
        decode_audio_base64("!!!!")
    with pytest.raises(InvalidMediaError):
        decode_image_base64("!!!!")


@pytest.mark.parametrize("text", ["!!!!", "data:audio/webm;base64,", "data:audio/webm;base64,!!!!"])
def test_audio_that_decodes_to_nothing_is_rejected(text: str) -> None:
    with pytest.raises(InvalidMediaError, match="empty"):
        decode_audio_base64(text)


def test_real_audio_still_decodes_raw_and_as_a_data_url() -> None:
    assert decode_audio_base64(GOOD_B64) == CLIP
    assert decode_audio_base64("data:audio/webm;base64," + GOOD_B64) == CLIP


@pytest.mark.parametrize("empty", ["!!!!", "data:audio/webm;base64,"])
@pytest.mark.parametrize(
    ("url", "scope"),
    [(STT_URL, "ai:speech:transcribe"), (VOICE_URL, "ai:meals:voice")],
)
def test_empty_audio_is_a_422_that_never_calls_gemini(
    client: TestClient, fake_llm: FakeLlm, empty: str, url: str, scope: str
) -> None:
    payload = {
        "audio": {"mimeType": "audio/m4a", "base64": empty},
        "model": MODEL,
        "deadlineMs": 20000,
    }
    response = client.post(url, json=payload, headers=auth(scope))

    assert response.status_code == 422
    assert response.json()["error"] == {
        "code": "INVALID_REQUEST",
        "message": "Audio data is empty.",
        "dispatched": False,  # Node may refund the quota unit: nothing reached Gemini
    }
    assert fake_llm.calls == []


def test_corrupt_image_keeps_its_exact_422_body(client: TestClient, fake_llm: FakeLlm) -> None:
    payload = {
        "image": {"mimeType": "image/jpeg", "base64": "aGVsbG8="},  # "hello": not an image
        "model": MODEL,
        "deadlineMs": 20000,
    }
    response = client.post(PHOTO_URL, json=payload, headers=auth("ai:meals:photo"))

    assert response.status_code == 422
    assert response.json() == {
        "error": {
            "code": "INVALID_REQUEST",
            "message": "Image data is not a valid JPEG, PNG, WebP or HEIC image.",
            "dispatched": False,
        }
    }
    assert fake_llm.calls == []
