"""Comprehensive tests for Gemini Native Structured Outputs in Meal Photo (Phase 1 / WP3).

Verifies 20+ test scenarios including:
- Multimodal image input decoding and transmission
- Corrupt image 422 rejection before any Gemini call (dispatched=False)
- Defensive extraction (parsed Pydantic instance, dict, raw JSON string, code fences)
- Strict error rejection on invalid schema or empty reply (raising 503 with usage)
- Non-food detection (is_food=False or 0 items -> outcome="no_food")
- Confidence mapping (high -> 0.9, medium -> 0.75, low -> 0.5)
- Safety blocks and Max Tokens handling with usage propagation
- Feature toggle rollback (AI_PHOTO_MEAL_STRUCTURED_OUTPUTS=false)
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
    GeminiPhotoMealOutput,
    is_meal_photo_structured_output_enabled,
)

URL = "/internal/v1/ai/meals/analyze-photo"
MODEL = {"primary": "gemini-primary", "fallback": "gemini-backup"}
JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF-fake-photo-bytes"
PNG = b"\x89PNG\r\n\x1a\n-fake-png"


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def auth(scope: str = "ai:meals:photo") -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(scope=scope)}"}


def body(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "image": {"mimeType": "image/jpeg", "base64": b64(JPEG)},
        "model": MODEL,
        "deadlineMs": 25500,
    }
    base.update(overrides)
    return base


def sample_photo_item(
    name: str = "Grilled Chicken",
    calories: float = 280.0,
    protein: float = 35.0,
    carbs: float = 0.0,
    fat: float = 6.0,
    fiber: float = 0.0,
    portion: str = "1 breast · 170 g",
) -> GeminiDetectedFoodItemOutput:
    return GeminiDetectedFoodItemOutput(
        name=name,
        portion_description=portion,
        serving_weight_g=170.0,
        serving_unit="piece",
        serving_size=1.0,
        calories=calories,
        protein_g=protein,
        carbs_g=carbs,
        fat_g=fat,
        fiber_g=fiber,
        confidence="high",
    )


# 1. Valid Meal Photo Structured
def test_valid_meal_photo_structured(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiPhotoMealOutput(
        is_food=True,
        summary="Grilled Chicken with Brown Rice",
        confidence="high",
        items=[
            sample_photo_item("Grilled Chicken", 280, 35, 0, 6, 0, "1 breast"),
            sample_photo_item("Brown Rice", 215, 5, 45, 1.8, 3.5, "1 cup"),
        ],
    )
    response = client.post(
        URL,
        json=body(mealType="dinner", notes="no sauce"),
        headers=auth() | {"X-Request-Id": "tr-mp-01"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == "ok"
    assert data["traceId"] == "tr-mp-01"
    result = data["result"]
    assert result["isFood"] is True
    assert result["summary"] == "Grilled Chicken with Brown Rice"
    assert result["overallConfidence"] == 0.9
    assert result["totalKcal"] == 495
    assert len(result["items"]) == 2
    assert result["items"][0]["name"] == "Grilled Chicken"
    assert result["items"][0]["brand"] == "AI Estimate"
    assert result["items"][0]["isAiEstimated"] is True
    assert result["items"][1]["name"] == "Brown Rice"


# 2. Multimodal image bytes sent to model
def test_multimodal_image_bytes_sent_to_model(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiPhotoMealOutput(
        is_food=True,
        summary="Oatmeal",
        confidence="high",
        items=[sample_photo_item("Oatmeal", 150, 5, 27, 2.5, 4)],
    )
    payload = body(image={"mimeType": "image/png", "base64": b64(PNG)})
    response = client.post(URL, json=payload, headers=auth())
    assert response.status_code == 200
    media = fake_llm.calls[0]["media"]
    assert media.mime_type == "image/png"
    assert media.data == PNG


# 3. Corrupt image fails 422 before Gemini
def test_corrupt_image_fails_422_before_gemini(client: TestClient, fake_llm: FakeLlm) -> None:
    payload = body(image={"mimeType": "image/jpeg", "base64": "NOT_BASE64_AT_ALL"})
    response = client.post(URL, json=payload, headers=auth())
    assert response.status_code == 422
    assert response.json()["error"]["dispatched"] is False
    assert fake_llm.calls == []


# 4. Non-food image produces no_food outcome
def test_non_food_image_produces_no_food_outcome(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiPhotoMealOutput(
        is_food=False,
        summary="Office desk with laptop",
        confidence="high",
        unclear_reason="No clear food detected in image.",
        items=[],
    )
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == "no_food"
    assert data["result"]["isFood"] is False
    assert data["result"]["summary"] == "Office desk with laptop"
    assert data["result"]["items"] == []
    assert data["result"]["totalKcal"] == 0
    assert data["result"]["unclearReason"] == "No clear food detected in image."


# 5. Empty items with is_food=True treated as no_food
def test_empty_items_treated_as_no_food(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiPhotoMealOutput(
        is_food=True,
        summary="Empty plate",
        confidence="medium",
        unclear_reason="No food remaining on plate.",
        items=[],
    )
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    data = response.json()
    assert data["outcome"] == "no_food"
    assert data["result"]["isFood"] is False


# 6. Parsed dict instance in llm_result
def test_parsed_dict_validation(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = {
        "isFood": True,
        "summary": "Fruit bowl",
        "confidence": "high",
        "items": [
            {
                "name": "Apple slices",
                "portionDescription": "1 bowl",
                "servingWeightG": 150,
                "servingUnit": "bowl",
                "servingSize": 1,
                "calories": 78,
                "proteinG": 0.4,
                "carbsG": 20,
                "fatG": 0.2,
                "fiberG": 3.6,
                "confidence": "high",
            }
        ],
    }
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    assert response.json()["result"]["items"][0]["name"] == "Apple slices"


# 7. Raw text JSON fallback when parsed is None
def test_raw_text_json_fallback(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = None
    fake_llm.text = json.dumps(
        {
            "isFood": True,
            "summary": "Boiled Egg",
            "confidence": "high",
            "items": [
                {
                    "name": "Egg",
                    "calories": 78,
                    "proteinG": 6.3,
                    "carbsG": 0.6,
                    "fatG": 5.3,
                    "confidence": "high",
                }
            ],
        }
    )
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    assert response.json()["result"]["items"][0]["name"] == "Egg"


# 8. Markdown code fences stripped
def test_markdown_code_fences_stripped(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = None
    fake_llm.text = f"```json\n{json.dumps({'isFood': False, 'summary': 'Keyboard', 'confidence': 'high', 'items': []})}\n```"
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    assert response.json()["outcome"] == "no_food"


# 9. Malformed JSON raises 503 with usage
def test_malformed_json_raises_503(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = None
    fake_llm.text = "NOT JSON"
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "PROVIDER_ERROR"
    assert error["dispatched"] is True
    assert "usage" in error
    assert error["usage"]["totalTokens"] == 125


# 10. Empty text raises 503 with usage
def test_empty_text_raises_503(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = None
    fake_llm.text = ""
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "PROVIDER_ERROR"
    assert error["dispatched"] is True
    assert "usage" in error


# 11. Safety finish reason raises 503 unavailable
def test_safety_finish_reason(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.finish_reason = "SAFETY"
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "PROVIDER_UNAVAILABLE"
    assert error["dispatched"] is True
    assert error["usage"]["totalTokens"] == 125


# 12. Max tokens finish reason raises 503 provider error
def test_max_tokens_finish_reason(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.finish_reason = "MAX_TOKENS"
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 503
    error = response.json()["error"]
    assert error["code"] == "PROVIDER_ERROR"
    assert error["dispatched"] is True
    assert error["usage"]["totalTokens"] == 125


# 13. Feature toggle rollback
def test_feature_toggle_rollback(
    client: TestClient, fake_llm: FakeLlm, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("AI_PHOTO_MEAL_STRUCTURED_OUTPUTS", "false")
    assert is_meal_photo_structured_output_enabled() is False

    fake_llm.text = json.dumps(
        {
            "isFood": True,
            "summary": "Soup",
            "items": [{"name": "Soup", "calories": 120, "proteinG": 4, "carbsG": 18, "fatG": 3}],
        }
    )
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    assert fake_llm.calls[0]["schema"] is None  # No structured schema passed to Gemini


# 14. Confidence mapping: high -> 0.9, medium -> 0.75, low -> 0.5
@pytest.mark.parametrize(
    ("conf_str", "expected_val"),
    [("high", 0.9), ("medium", 0.75), ("low", 0.5)],
)
def test_confidence_mapping(
    client: TestClient, fake_llm: FakeLlm, conf_str: str, expected_val: float
) -> None:
    fake_llm.parsed = GeminiPhotoMealOutput(
        is_food=True,
        summary="Tea",
        confidence=conf_str,  # type: ignore[arg-type]
        items=[sample_photo_item("Tea", 30, 0.5, 5, 0.5)],
    )
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    assert response.json()["result"]["overallConfidence"] == expected_val


# 15. Bounds sanitization: excessive calories bounded
def test_bounds_sanitization(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiPhotoMealOutput(
        is_food=True,
        summary="Giant Meal",
        confidence="high",
        items=[sample_photo_item("Huge Cake", calories=50000, protein=-5, carbs=3000, fat=2000)],
    )
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    item = response.json()["result"]["items"][0]
    assert item["kcal"] <= 5000
    assert item["protein"] >= 0.0


# 16. Portion description fallback to weight
def test_portion_description_fallback(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiPhotoMealOutput(
        is_food=True,
        summary="Steak",
        confidence="high",
        items=[
            GeminiDetectedFoodItemOutput(
                name="Steak",
                portion_description=None,
                serving_weight_g=250.0,
                calories=500,
                protein_g=55.0,
                carbs_g=0.0,
                fat_g=30.0,
            )
        ],
    )
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    item = response.json()["result"]["items"][0]
    assert item["serving"] == "250g"


# 17. Deterministic food item ID generation
def test_deterministic_food_id(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiPhotoMealOutput(
        is_food=True,
        summary="Nuts",
        confidence="high",
        items=[sample_photo_item("Almonds", 160, 6, 6, 14)],
    )
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    item_id = response.json()["result"]["items"][0]["id"]
    assert item_id.startswith("ai-food-")


# 18. Totals rounding and summing
def test_totals_rounding(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiPhotoMealOutput(
        is_food=True,
        summary="Snack combo",
        confidence="high",
        items=[
            sample_photo_item("Item A", 120.4, 8.16, 12.34, 4.12, 1.2),
            sample_photo_item("Item B", 80.6, 2.11, 10.22, 3.44, 0.8),
        ],
    )
    response = client.post(URL, json=body(), headers=auth())
    assert response.status_code == 200
    res = response.json()["result"]
    assert res["totalKcal"] == 201
    assert res["totalProteinGrams"] == 10.3
    assert res["totalCarbsGrams"] == 22.5
    assert res["totalFatGrams"] == 7.5


# 19. User notes and meal type included in prompt
def test_prompt_includes_notes_and_meal_type(client: TestClient, fake_llm: FakeLlm) -> None:
    fake_llm.parsed = GeminiPhotoMealOutput(
        is_food=True,
        summary="Breakfast",
        confidence="high",
        items=[sample_photo_item()],
    )
    response = client.post(
        URL, json=body(mealType="breakfast", notes="extra spicy"), headers=auth()
    )
    assert response.status_code == 200
    prompt = fake_llm.calls[0]["prompt"]
    assert "Assumed meal type: breakfast" in prompt
    assert 'User notes: "extra spicy"' in prompt


# 20. Telemetry privacy: image bytes and notes never logged
def test_telemetry_privacy(
    client: TestClient, fake_llm: FakeLlm, caplog: pytest.LogCaptureFixture
) -> None:
    fake_llm.parsed = GeminiPhotoMealOutput(
        is_food=True,
        summary="SECRET-SUMMARY",
        confidence="high",
        items=[sample_photo_item()],
    )
    payload = body(
        image={"mimeType": "image/jpeg", "base64": b64(JPEG + b"SECRET-PHOTO-CONTENT")},
        notes="SECRET-NOTES-CONTENT",
    )
    with caplog.at_level("DEBUG"):
        response = client.post(URL, json=payload, headers=auth())
        assert response.status_code == 200

    logs = "\n".join(r.getMessage() for r in caplog.records)
    assert "meal_photo" in logs
    assert "SECRET-PHOTO-CONTENT" not in logs
    assert "SECRET-NOTES-CONTENT" not in logs
