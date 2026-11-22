"""Comprehensive tests for Gemini Native Structured Outputs in Voice Meal (Phase 1 / WP2).

Verifies 20+ test scenarios including:
- Multilingual parsing (English, Tamil, Tanglish)
- Audio-only, text-only, and combined audio+text inputs
- Defensive extraction (parsed Pydantic instance, dict, raw JSON string, code fences)
- Strict error rejection on invalid schema or empty reply (raising 503 with usage)
- Safety blocks and Max Tokens handling with usage propagation
- Feature toggle rollback (AI_VOICE_MEAL_STRUCTURED_OUTPUTS=false)
- Domain bounds sanitization and portion fallback
- Deterministic ID generation and telemetry privacy
"""

import base64
import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from conftest import FakeLlm, make_token
from onusfit_ai.features.meals.application.schemas import (
    GeminiDetectedFoodItemOutput,
    GeminiVoiceMealOutput,
    is_voice_meal_structured_output_enabled,
)

URL = "/internal/v1/ai/meals/parse-voice"
MODEL = {"primary": "gemini-primary", "fallback": "gemini-backup"}


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


def sample_voice_item(
    name: str = "Dosa",
    calories: float = 260.0,
    protein: float = 6.0,
    carbs: float = 44.0,
    fat: float = 7.0,
    fiber: float = 2.0,
    portion: str = "2 pieces",
) -> GeminiDetectedFoodItemOutput:
    return GeminiDetectedFoodItemOutput(
        name=name,
        portion_description=portion,
        serving_weight_g=160.0,
        serving_unit="piece",
        serving_size=2.0,
        calories=calories,
        protein_g=protein,
        carbs_g=carbs,
        fat_g=fat,
        fiber_g=fiber,
        confidence="high",
    )


# 1. Valid English Voice Meal
def test_valid_english_voice_meal(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiVoiceMealOutput(
        transcript="two dosa and sambar",
        detected_language="en",
        confidence="high",
        items=[
            sample_voice_item("Dosa", 260, 6, 44, 7, 2, "2 pieces"),
            sample_voice_item("Sambar", 85, 3, 12, 2, 3, "1 small bowl"),
        ],
    )
    response = client.post(URL, json=body(), headers=auth() | {"X-Request-Id": "tr-vm-01"})
    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == "ok"
    assert data["traceId"] == "tr-vm-01"
    result = data["result"]
    assert result["detectedLanguage"] == "en"
    assert result["totalKcal"] == 345
    assert len(result["items"]) == 2
    assert result["items"][0]["name"] == "Dosa"
    assert result["items"][0]["brand"] == "AI Voice Estimate"
    assert result["items"][0]["isAiEstimated"] is True
    assert result["items"][1]["name"] == "Sambar"


# 2. Tamil script input
def test_tamil_script_voice_meal(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiVoiceMealOutput(
        transcript="இரண்டு இட்லி மற்றும் சாம்பார்",
        detected_language="ta",
        confidence="high",
        items=[sample_voice_item("Idli", 130, 4, 26, 0.5, 1, "2 pieces")],
    )
    response = client.post(
        URL, json=body(transcript="இரண்டு இட்லி மற்றும் சாம்பார்", lang="ta"), headers=auth()
    )
    assert response.status_code == 200
    data = response.json()
    assert data["result"]["detectedLanguage"] == "ta"
    assert data["result"]["transcript"] == "இரண்டு இட்லி மற்றும் சாம்பார்"
    assert len(data["result"]["items"]) == 1


# 3. Tanglish transcript
def test_tanglish_transcript_voice_meal(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiVoiceMealOutput(
        transcript="rendu chapathi veg kurma saaptom",
        detected_language="tanglish",
        confidence="high",
        items=[
            sample_voice_item("Chapathi", 200, 6, 36, 4, 4, "2 pieces"),
            sample_voice_item("Veg Kurma", 120, 3, 14, 6, 3, "1 cup"),
        ],
    )
    response = client.post(
        URL, json=body(transcript="rendu chapathi veg kurma saaptom", lang="ta"), headers=auth()
    )
    assert response.status_code == 200
    data = response.json()
    assert data["result"]["detectedLanguage"] == "tanglish"
    assert data["result"]["totalKcal"] == 320


# 4. Audio-only input
def test_audio_only_input(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiVoiceMealOutput(
        transcript="one black coffee without sugar",
        detected_language="en",
        confidence="high",
        items=[sample_voice_item("Black Coffee", 5, 0.3, 0.5, 0, 0, "1 cup")],
    )
    clip = b"\x00\x01test-audio"
    payload = body(
        transcript=None, audio={"mimeType": "audio/m4a", "base64": base64.b64encode(clip).decode()}
    )
    response = client.post(URL, json=payload, headers=auth())
    assert response.status_code == 200
    data = response.json()
    assert data["result"]["transcript"] == "one black coffee without sugar"
    assert data["result"]["totalKcal"] == 5
    assert fake_llm.calls[0]["media"].data == clip


# 5. Audio and transcript combined
def test_audio_and_transcript_combined(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiVoiceMealOutput(
        transcript="boiled eggs and toast",
        detected_language="en",
        confidence="high",
        items=[sample_voice_item("Boiled Eggs", 155, 13, 1.1, 11, 0, "2 large eggs")],
    )
    clip = b"audio-data"
    payload = body(
        transcript="boiled eggs and toast",
        audio={"mimeType": "audio/mp4", "base64": base64.b64encode(clip).decode()},
    )
    response = client.post(URL, json=payload, headers=auth())
    assert response.status_code == 200
    assert fake_llm.calls[0]["media"] is not None


# 6. Non-food description produces no_food outcome
def test_non_food_description_outcome(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiVoiceMealOutput(
        transcript="just walking in the park",
        detected_language="en",
        confidence="low",
        unclear_reason="No food mentioned.",
        items=[],
    )
    response = client.post(URL, json=body(transcript="just walking in the park"), headers=auth())
    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == "no_food"
    assert data["result"]["items"] == []
    assert data["result"]["totalKcal"] == 0
    assert data["result"]["unclearReason"] == "No food mentioned."


# 7. Parsed dict instance in llm_result
def test_parsed_dict_validation(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = {
        "transcript": "apple",
        "detectedLanguage": "en",
        "confidence": "high",
        "items": [
            {
                "name": "Apple",
                "portionDescription": "1 medium",
                "servingWeightG": 182,
                "servingUnit": "fruit",
                "servingSize": 1,
                "calories": 95,
                "proteinG": 0.5,
                "carbsG": 25,
                "fatG": 0.3,
                "fiberG": 4.4,
                "confidence": "high",
            }
        ],
    }
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    assert response.json()["result"]["items"][0]["name"] == "Apple"


# 8. Raw text JSON fallback when parsed is None
def test_raw_text_json_fallback(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = None
    fake_llm.text = json.dumps(
        {
            "transcript": "banana",
            "detectedLanguage": "en",
            "confidence": "high",
            "items": [
                {
                    "name": "Banana",
                    "calories": 105,
                    "proteinG": 1.3,
                    "carbsG": 27,
                    "fatG": 0.3,
                    "confidence": "high",
                }
            ],
        }
    )
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    assert response.json()["result"]["items"][0]["name"] == "Banana"


# 9. Markdown code fences stripped
def test_markdown_code_fences_stripped(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = None
    fake_llm.text = f"```json\n{json.dumps({'transcript': 'water', 'detectedLanguage': 'en', 'confidence': 'high', 'items': []})}\n```"
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    assert response.json()["outcome"] == "no_food"


# 10. Malformed JSON raises 503 with usage
def test_malformed_json_raises_503(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = None
    fake_llm.text = "NOT VALID JSON"
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "PROVIDER_ERROR"
    assert error["dispatched"] is True
    assert "usage" in error
    assert error["usage"]["totalTokens"] == 125


# 11. Empty text raises 503 with usage
def test_empty_text_raises_503(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = None
    fake_llm.text = "   "
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "PROVIDER_ERROR"
    assert error["dispatched"] is True
    assert "usage" in error


# 12. Safety finish reason raises 503 unavailable
def test_safety_finish_reason(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.finish_reason = "SAFETY"
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "PROVIDER_UNAVAILABLE"
    assert error["dispatched"] is True
    assert error["usage"]["totalTokens"] == 125


# 13. Max tokens finish reason raises 503 provider error
def test_max_tokens_finish_reason(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.finish_reason = "MAX_TOKENS"
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "PROVIDER_ERROR"
    assert error["dispatched"] is True
    assert error["usage"]["totalTokens"] == 125


# 14. Feature toggle rollback
def test_feature_toggle_rollback(
    client: TestClient, fake_llm: FakeLlm, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("AI_VOICE_MEAL_STRUCTURED_OUTPUTS", "false")
    assert is_voice_meal_structured_output_enabled() is False

    fake_llm.text = json.dumps(
        {
            "transcript": "dosa",
            "items": [{"name": "Dosa", "calories": 260, "proteinG": 6, "carbsG": 44, "fatG": 7}],
        }
    )
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    assert fake_llm.calls[0]["schema"] is None  # No structured schema passed to Gemini


# 15. Bounds sanitization: excessive calories bounded
def test_bounds_sanitization(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiVoiceMealOutput(
        transcript="huge feast",
        detected_language="en",
        confidence="high",
        items=[
            sample_voice_item("Ultra Burger", calories=99999, protein=-10, carbs=5000, fat=2000)
        ],
    )
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    item = response.json()["result"]["items"][0]
    # Bound to realistic domain limits
    assert item["kcal"] <= 5000
    assert item["protein"] >= 0.0


# 16. Portion description fallback to weight
def test_portion_description_fallback(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiVoiceMealOutput(
        transcript="rice",
        detected_language="en",
        confidence="high",
        items=[
            GeminiDetectedFoodItemOutput(
                name="Rice",
                portion_description=None,
                serving_weight_g=150.0,
                calories=195,
                protein_g=4.0,
                carbs_g=43.0,
                fat_g=0.4,
            )
        ],
    )
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    item = response.json()["result"]["items"][0]
    assert item["serving"] == "150g"


# 17. Deterministic food item ID generation
def test_deterministic_food_id(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiVoiceMealOutput(
        transcript="egg",
        detected_language="en",
        confidence="high",
        items=[sample_voice_item("Egg", 78, 6, 0.6, 5)],
    )
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    item_id = response.json()["result"]["items"][0]["id"]
    assert item_id.startswith("voice-food-")


# 18. Totals rounding and summing
def test_totals_rounding(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiVoiceMealOutput(
        transcript="salad and dressing",
        detected_language="en",
        confidence="high",
        items=[
            sample_voice_item("Salad", 50.4, 2.14, 8.26, 0.5, 3.2),
            sample_voice_item("Dressing", 100.8, 0.22, 2.11, 10.33, 0.1),
        ],
    )
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    res = response.json()["result"]
    assert res["totalKcal"] == 151
    assert res["totalProteinGrams"] == 2.3
    assert res["totalCarbsGrams"] == 10.4
    assert res["totalFatGrams"] == 10.8


# 19. Default serving weight when omitted
def test_default_serving_weight(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiVoiceMealOutput(
        transcript="snack",
        detected_language="en",
        confidence="high",
        items=[
            GeminiDetectedFoodItemOutput(
                name="Snack",
                serving_weight_g=None,
                calories=100,
                protein_g=2,
                carbs_g=15,
                fat_g=3,
            )
        ],
    )
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    item = response.json()["result"]["items"][0]
    assert item["servingWeightG"] == 100.0


# 20. Telemetry privacy: audio and transcripts never logged
def test_telemetry_privacy(
    client: TestClient, fake_llm: FakeLlm, caplog: pytest.LogCaptureFixture
) -> None:
    fake_llm.parsed = GeminiVoiceMealOutput(
        transcript="SECRET-USER-TRANSCRIPT",
        detected_language="en",
        confidence="high",
        items=[sample_voice_item("Dosa")],
    )
    payload = body(
        transcript="SECRET-INPUT-TRANSCRIPT",
        audio={"mimeType": "audio/m4a", "base64": base64.b64encode(b"SECRET-AUDIO-BYTES").decode()},
    )
    with caplog.at_level("DEBUG"):
        response = client.post(URL, json=payload, headers=auth())
        assert response.status_code == 200

    logs = "\n".join(r.getMessage() for r in caplog.records)
    assert "voice_meal" in logs
    assert "SECRET-USER-TRANSCRIPT" not in logs
    assert "SECRET-INPUT-TRANSCRIPT" not in logs
    assert "SECRET-AUDIO-BYTES" not in logs
