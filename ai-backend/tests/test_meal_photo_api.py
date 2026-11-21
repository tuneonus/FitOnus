import asyncio
import base64
import json
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from conftest import FakeLlm, make_token
from onusfit_ai.main import create_app
from onusfit_ai.shared.errors import AiError
from onusfit_ai.shared.llm.dependencies import get_llm
from onusfit_ai.shared.llm.gemini import GeminiClient
from test_gemini_client import FakeSdk, make_response, overloaded, rate_limit

URL = "/internal/v1/ai/meals/analyze-photo"
MODEL = {"primary": "gemini-primary", "fallback": "gemini-backup"}
JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF-fake-photo-bytes"
PNG = b"\x89PNG\r\n\x1a\n-fake-png"
WEBP = b"RIFF\x24\x00\x00\x00WEBPVP8 "
HEIC = b"\x00\x00\x00\x18ftypheic\x00\x00"
GOOD_REPLY = json.dumps(
    {
        "isFood": True,
        "summary": "Dosa with sambar",
        "confidence": "high",
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
            }
        ],
    }
)


def auth(scope: str = "ai:meals:photo") -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(scope=scope)}"}


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def body(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "image": {"mimeType": "image/jpeg", "base64": b64(JPEG)},
        "model": MODEL,
        "deadlineMs": 25500,
    }
    base.update(overrides)
    return base


@pytest.fixture
def vision(fake_llm: FakeLlm) -> FakeLlm:
    fake_llm.text = GOOD_REPLY
    return fake_llm


def test_success_returns_the_public_shape_and_sends_the_photo(
    client: TestClient, vision: FakeLlm
) -> None:
    response = client.post(
        URL,
        json=body(mealType="breakfast", notes="no sugar"),
        headers=auth() | {"X-Request-Id": "r9"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == "ok" and data["traceId"] == "r9"
    result = data["result"]
    assert (result["isFood"], result["summary"], result["overallConfidence"]) == (
        True,
        "Dosa with sambar",
        0.9,
    )
    assert result["items"][0]["brand"] == "AI Estimate" and result["items"][0]["kcal"] == 260
    assert result["totalKcal"] == 260 and result["totalFiberGrams"] == 2
    assert "unclearReason" not in result or result["unclearReason"] is None
    assert data["usage"]["model"] == "gemini-primary"
    call = vision.calls[0]
    assert (call["primary"], call["fallback"], call["deadline_s"]) == (
        "gemini-primary",
        "gemini-backup",
        25.5,
    )
    assert (call["media"].mime_type, call["media"].data) == ("image/jpeg", JPEG)
    assert (
        "Assumed meal type: breakfast" in call["prompt"]
        and 'User notes: "no sugar"' in call["prompt"]
    )


def test_data_url_photo_is_accepted(client: TestClient, vision: FakeLlm) -> None:
    payload = body(image={"mimeType": "image/png", "base64": "data:image/png;base64," + b64(PNG)})
    assert client.post(URL, json=payload, headers=auth()).status_code == 200
    assert vision.calls[0]["media"].data == PNG


@pytest.mark.parametrize(
    ("mime", "data"),
    [("image/jpeg", JPEG), ("image/png", PNG), ("image/webp", WEBP), ("image/heic", HEIC)],
)
def test_supported_formats_are_accepted(
    client: TestClient, vision: FakeLlm, mime: str, data: bytes
) -> None:
    payload = body(image={"mimeType": mime, "base64": b64(data)})
    assert client.post(URL, json=payload, headers=auth()).status_code == 200


@pytest.mark.parametrize(
    "mime",
    [
        "image/gif",
        "image/bmp",
        "image/svg+xml",
        "image/tiff",
        "application/pdf",
        "IMAGE/JPEG",
        "jpeg",
    ],
)
def test_unsupported_formats_are_rejected_before_gemini(
    client: TestClient, vision: FakeLlm, mime: str
) -> None:
    payload = body(image={"mimeType": mime, "base64": b64(JPEG)})
    response = client.post(URL, json=payload, headers=auth())
    assert response.status_code == 422
    assert "image.mimeType" in [f["field"] for f in response.json()["error"]["fields"]]
    assert vision.calls == []


def test_photo_over_10mb_is_rejected_before_gemini(client: TestClient, vision: FakeLlm) -> None:
    payload = body(image={"mimeType": "image/jpeg", "base64": "A" * (10 * 1024 * 1024 + 1)})
    response = client.post(URL, json=payload, headers=auth())
    assert response.status_code == 422
    assert vision.calls == []


def test_photo_exactly_at_the_limit_is_accepted(client: TestClient, vision: FakeLlm) -> None:
    # "/9j/" is the base64 of the JPEG signature; the rest is padding-free filler.
    text = "/9j/" + "A" * (10 * 1024 * 1024 - 4)
    payload = body(image={"mimeType": "image/jpeg", "base64": text})
    assert client.post(URL, json=payload, headers=auth()).status_code == 200


@pytest.mark.parametrize(
    "text",
    [
        "!!!!not-base64!!!!",  # not base64 at all
        "a,b",  # comma but nothing decodable
        b64(b"just some text, not a picture"),  # valid base64, not an image
        b64(b"GIF89a-an-animated-gif"),  # an image format we do not support
        "A",  # truncated base64
        b64(JPEG)[:-3],  # base64 cut mid-quantum (bad padding)
    ],
)
def test_malformed_images_are_a_422_that_never_calls_gemini(
    client: TestClient, vision: FakeLlm, text: str
) -> None:
    response = client.post(
        URL, json=body(image={"mimeType": "image/jpeg", "base64": text}), headers=auth()
    )
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "INVALID_REQUEST" and error["dispatched"] is False
    assert len(text) < 8 or text not in response.text  # never echoes the input
    assert vision.calls == []


@pytest.mark.parametrize(
    "mutate",
    [
        lambda b: b.pop("image"),
        lambda b: b["image"].update(base64=""),
        lambda b: b["image"].update(mimeType=""),
        lambda b: b.update(deadlineMs=10),
        lambda b: b.update(deadlineMs=99999),
        lambda b: b.update(userId="someone"),
        lambda b: b.update(transcript="not accepted here"),
        lambda b: b.update(notes="n" * 251),
        lambda b: b.update(mealType="m" * 201),
        lambda b: b.update(model={"primary": "bad name!"}),
        lambda b: b.pop("model"),
    ],
)
def test_invalid_requests_are_rejected_without_echoing_input(
    client: TestClient, vision: FakeLlm, mutate: Any
) -> None:
    payload = body()
    payload["image"]["base64"] = b64(JPEG + b"SECRET-PHOTO-PAYLOAD")
    mutate(payload)
    response = client.post(URL, json=payload, headers=auth())
    assert response.status_code == 422
    assert "SECRET-PHOTO-PAYLOAD" not in response.text
    assert b64(JPEG + b"SECRET-PHOTO-PAYLOAD") not in response.text
    assert vision.calls == []


def test_notes_at_the_limit_are_accepted(client: TestClient, vision: FakeLlm) -> None:
    assert client.post(URL, json=body(notes="n" * 250), headers=auth()).status_code == 200


@pytest.mark.parametrize("scope", ["ai:coach:chat", "ai:meals:voice", "ai:speech:transcribe"])
def test_other_scopes_are_refused(client: TestClient, vision: FakeLlm, scope: str) -> None:
    assert client.post(URL, json=body(), headers=auth(scope=scope)).status_code == 401
    assert vision.calls == []


def test_missing_or_wrong_token_is_rejected(client: TestClient, vision: FakeLlm) -> None:
    assert client.post(URL, json=body()).status_code == 401
    wrong_secret = {
        "Authorization": "Bearer " + make_token(secret="x" * 40, scope="ai:meals:photo")
    }
    assert client.post(URL, json=body(), headers=wrong_secret).status_code == 401
    assert vision.calls == []


def test_other_endpoints_do_not_accept_a_photo_token(client: TestClient, vision: FakeLlm) -> None:
    response = client.post(
        "/internal/v1/ai/meals/parse-voice", json={"transcript": "dosa"}, headers=auth()
    )
    assert response.status_code == 401


def test_malformed_gemini_reply_is_flagged_and_keeps_the_known_not_formatted_result(
    client: TestClient, vision: FakeLlm, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("AI_PHOTO_MEAL_STRUCTURED_OUTPUTS", "false")
    vision.text = "Sorry, I cannot tell."
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == "parse_failed"
    assert data["result"]["isFood"] is False
    assert data["result"]["summary"] == "Unable to parse food analysis"
    assert data["result"]["items"] == [] and data["result"]["totalKcal"] == 0


def test_malformed_gemini_reply_in_structured_mode_raises_503(
    client: TestClient, vision: FakeLlm
) -> None:
    vision.text = "Sorry, I cannot tell."
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "PROVIDER_ERROR"
    assert error["dispatched"] is True
    assert "usage" in error
    assert error["usage"]["totalTokens"] == 125


def test_a_photo_without_food_is_a_normal_answer(client: TestClient, vision: FakeLlm) -> None:
    vision.text = json.dumps(
        {"isFood": False, "summary": "No food detected", "unclearReason": "A desk.", "items": []}
    )
    data = client.post(URL, json=body(), headers=auth()).json()
    assert data["outcome"] == "no_food"
    assert data["result"]["isFood"] is False and data["result"]["unclearReason"] == "A desk."


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


def test_photo_notes_and_reply_are_never_logged(
    client: TestClient, vision: FakeLlm, caplog: pytest.LogCaptureFixture
) -> None:
    vision.text = json.dumps(
        {"isFood": True, "summary": "PRIVATE-SUMMARY", "items": [{"name": "PRIVATE-FOOD"}]}
    )
    photo = b64(JPEG + b"PRIVATE-PHOTO-BYTES")
    with caplog.at_level("DEBUG"):
        response = client.post(
            URL,
            json=body(image={"mimeType": "image/jpeg", "base64": photo}, notes="PRIVATE-NOTE"),
            headers=auth(),
        )
    assert response.status_code == 200
    logged = "\n".join(r.getMessage() for r in caplog.records)
    assert "meal_photo" in logged
    for private in (
        "PRIVATE-SUMMARY",
        "PRIVATE-FOOD",
        "PRIVATE-PHOTO-BYTES",
        "PRIVATE-NOTE",
        photo,
    ):
        assert private not in logged


# --- the real GeminiClient with a fake SDK (no network): fallback and timeouts with an image ---


def app_with_sdk(sdk: Any, attempt_timeout_s: float = 20.0) -> TestClient:
    llm = GeminiClient(None, sdk_client=sdk, attempt_timeout_s=attempt_timeout_s)
    app = create_app()
    app.dependency_overrides[get_llm] = lambda: llm
    return TestClient(app)


def test_photo_goes_to_the_fallback_model_when_the_primary_is_overloaded() -> None:
    sdk = FakeSdk({"gemini-primary": overloaded(), "gemini-backup": make_response(GOOD_REPLY)})
    response = app_with_sdk(sdk).post(URL, json=body(), headers=auth())

    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == "ok"
    assert data["usage"]["model"] == "gemini-backup" and data["usage"]["isFallback"] is True
    assert sdk.calls == ["gemini-primary", "gemini-backup"]
    for contents in sdk.contents:  # the same image + prompt go to both models, image first
        assert contents[0].inline_data.data == JPEG
        assert contents[0].inline_data.mime_type == "image/jpeg"
        assert "OnusFit AI Meal Scanner" in contents[1]


def test_both_models_failing_is_a_controlled_503_after_exactly_two_calls() -> None:
    sdk = FakeSdk({"gemini-primary": overloaded(), "gemini-backup": overloaded()})
    response = app_with_sdk(sdk).post(URL, json=body(), headers=auth())
    assert response.status_code == 503
    error = response.json()["error"]
    assert (error["code"], error["dispatched"]) == ("AI_UNAVAILABLE", True)
    assert sdk.calls == ["gemini-primary", "gemini-backup"]


def test_gemini_rate_limit_is_reported_as_429_without_provider_text() -> None:
    sdk = FakeSdk({"gemini-primary": rate_limit(), "gemini-backup": rate_limit()})
    response = app_with_sdk(sdk).post(
        URL, json=body(model={"primary": "gemini-primary"}), headers=auth()
    )
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "PROVIDER_RATE_LIMITED"
    assert "slow" not in response.text  # the provider's own message never leaks
    assert sdk.calls == ["gemini-primary"]


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


def test_missing_gemini_key_fails_before_any_call_and_is_not_billable() -> None:
    client = TestClient(create_app())  # real get_llm; autouse fixture removed GEMINI_API_KEY
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 503
    error = response.json()["error"]
    assert (error["code"], error["dispatched"]) == ("PROVIDER_NOT_CONFIGURED", False)
