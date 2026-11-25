"""Phase 15 integration tests with Phase 13 multi-agent coach and multimodal attachments."""

import base64
import json
import struct
from typing import Any

import pytest
from fastapi.testclient import TestClient

from conftest import FakeLlm, load_request, make_token
from onusfit_ai.features.coach.application.multi_agent.context import build_shared_execution_context
from onusfit_ai.features.coach.application.multi_agent.graph.executor import MultiAgentCoachExecutor
from onusfit_ai.features.coach.application.multi_agent.router import SupervisorRouter
from onusfit_ai.features.coach.domain.chat import CoachChatRequest
from onusfit_ai.features.coach.domain.multi_agent import (
    AgentRole,
    MultiAgentExecutionBudget,
    MultiAgentWorkflowStatus,
    OrchestrationMode,
)
from onusfit_ai.shared.llm.ports import LlmResult, LlmUsage, MediaInput
from onusfit_ai.shared.tools import create_multimodal_meal_port

COACH_URL = "/internal/v1/ai/coach/chat"
MULTIMODAL_URL = "/internal/v1/ai/meals/analyze-multimodal"


def _jpeg_with_gps_exif() -> bytes:
    exif = b"Exif\x00\x00GPS_LAT=13.0827,GPS_LON=80.2707"
    exif_seg = b"\xff\xe1" + struct.pack(">H", len(exif) + 2) + exif
    return b"\xff\xd8" + exif_seg + b"\xff\xda\x00\x08\x01\x01\x00\x00\x3f\x00img\xff\xd9"


def test_router_never_bypasses_when_multimodal_attachment_is_present() -> None:
    payload = load_request("full")
    payload["message"] = "hi"
    payload["image"] = {
        "mimeType": "image/jpeg",
        "base64": base64.b64encode(_jpeg_with_gps_exif()).decode(),
    }
    req = CoachChatRequest.model_validate(payload)
    shared = build_shared_execution_context(
        req,
        trace_id="trace-mm-route",
        user_id="user-1",
        language="en",
    )
    assert shared.has_image_attachment is True
    assert shared.attachment_modalities == ["image"]

    router = SupervisorRouter()
    decision = router.route(
        shared,
        available_agents={AgentRole.NUTRITION},
        budget=MultiAgentExecutionBudget(),
    )
    assert decision.mode != OrchestrationMode.BYPASS
    assert any(
        task.target_agent == AgentRole.NUTRITION
        and task.input_data.get("has_multimodal_attachment")
        for task in decision.tasks
    )


def test_coach_chat_with_image_attachment_strips_exif_and_routes_to_nutrition_agent(
    client: TestClient,
    fake_llm: FakeLlm,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_COACH_MULTI_AGENT_ENABLED", "true")
    observed_calls: list[dict[str, Any]] = []

    async def _sequenced_generate(
        prompt: str,
        *,
        primary_model: str,
        fallback_model: str | None,
        deadline_s: float,
        media: Any = None,
        schema: Any = None,
        **kwargs: Any,
    ) -> LlmResult:
        observed_calls.append({"prompt": prompt, "media": media, "user_id": kwargs.get("user_id"), "schema": schema})
        if len(observed_calls) == 1:
            mm_payload = {
                "isFood": True,
                "summary": "2 Idli with Sambar",
                "transcript": "enna sapadu ithu",
                "detectedLanguage": "tanglish",
                "items": [
                    {
                        "name": "Idli with Sambar",
                        "portionDescription": "2 pieces · 160 g",
                        "servingWeightG": 160,
                        "servingUnit": "piece",
                        "servingSize": 2,
                        "calories": 220,
                        "proteinG": 7.5,
                        "carbsG": 40.0,
                        "fatG": 3.0,
                        "fiberG": 2.5,
                        "confidence": "medium",
                    }
                ],
                "confidence": "medium",
                "unclearReason": "Sambar oil can vary.",
            }
            parsed_val = schema.model_validate(mm_payload) if schema else None
            text = json.dumps(mm_payload)
        else:
            coach_payload = {
                "text": "Your meal photo shows ~220 kcal and ~7.5 g protein (AI estimate; portions may vary).",
                "followUps": ["Should I add eggs or paneer for extra protein?"],
                "sources": ["Multimodal Meal Analyzer", "Nutrition Profile"],
                "medicalNote": False,
            }
            parsed_val = schema.model_validate(coach_payload) if schema else None
            text = json.dumps(coach_payload)
        return LlmResult(
            text=text,
            parsed=parsed_val,
            usage=LlmUsage(
                model=primary_model,
                is_fallback=False,
                input_tokens=200,
                output_tokens=60,
                cached_tokens=0,
                thinking_tokens=0,
                total_tokens=260,
                duration_ms=80,
            ),
        )

    monkeypatch.setattr(fake_llm, "generate_text", _sequenced_generate)

    payload = load_request("full")
    payload["message"] = "Enna sapadu ithu? Check protein"
    payload["image"] = {
        "mimeType": "image/jpeg",
        "base64": base64.b64encode(_jpeg_with_gps_exif()).decode(),
    }

    token = make_token(scope="ai:coach:chat", sub="11111111-1111-1111-1111-111111111111")
    resp = client.post(COACH_URL, json=payload, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["outcome"] == "ok"
    assert "protein" in body["result"]["text"].lower()
    assert observed_calls[0]["user_id"] == "11111111-1111-1111-1111-111111111111"
    assert getattr(observed_calls[0]["schema"], "__name__", "") == "GeminiMultimodalMealOutput"
    # Image passed to NutritionAgent multimodal call had GPS EXIF stripped
    first_media = observed_calls[0]["media"]
    media_items = first_media if isinstance(first_media, list) else [first_media]
    assert all(isinstance(m, MediaInput) and b"GPS_LAT" not in m.data for m in media_items)


async def test_multi_agent_executor_completes_multimodal_synthesis_without_resending_media(
    client: TestClient,
) -> None:
    _ = client  # ensure create_app() registered _MultimodalMealPortAdapter
    calls: list[dict[str, Any]] = []

    class _TwoStepLlm:
        async def generate_text(
            self,
            prompt: str,
            *,
            primary_model: str,
            fallback_model: str | None,
            deadline_s: float,
            media: Any = None,
            schema: Any = None,
            **kwargs: Any,
        ) -> LlmResult:
            calls.append({"media": media, "schema": getattr(schema, "__name__", None), **kwargs})
            if len(calls) == 1:
                payload_out: dict[str, Any] = {
                    "isFood": True,
                    "summary": "2 Idli with Sambar",
                    "transcript": "enna sapadu ithu",
                    "detectedLanguage": "tanglish",
                    "items": [
                        {
                            "name": "Idli with Sambar",
                            "portionDescription": "2 pieces · 160 g",
                            "servingWeightG": 160,
                            "servingUnit": "piece",
                            "servingSize": 2,
                            "calories": 220,
                            "proteinG": 7.5,
                            "carbsG": 40.0,
                            "fatG": 3.0,
                            "fiberG": 2.5,
                            "confidence": "medium",
                        }
                    ],
                    "confidence": "medium",
                }
            else:
                payload_out = {
                    "text": "2 Idli with Sambar provides ~220 kcal and ~7.5 g protein (AI estimate).",
                    "followUps": ["Pair with boiled eggs for more protein?"],
                    "sources": ["Multimodal Meal Analyzer"],
                    "medicalNote": False,
                }
            return LlmResult(
                text=json.dumps(payload_out),
                parsed=schema.model_validate(payload_out) if schema else None,
                usage=LlmUsage(
                    model=primary_model,
                    is_fallback=False,
                    input_tokens=150,
                    output_tokens=50,
                    cached_tokens=0,
                    thinking_tokens=0,
                    total_tokens=200,
                    duration_ms=50,
                ),
            )

    payload = load_request("full")
    payload["message"] = "Enna sapadu ithu? Check protein"
    payload["image"] = {
        "mimeType": "image/jpeg",
        "base64": base64.b64encode(_jpeg_with_gps_exif()).decode(),
    }
    req = CoachChatRequest.model_validate(payload)

    executor = MultiAgentCoachExecutor(enable_fallback=False)
    result = await executor.execute(
        request=req,
        llm=_TwoStepLlm(),  # type: ignore[arg-type]
        trace_id="trace-ma-mm-complete",
        user_id="11111111-1111-1111-1111-111111111111",
        multimodal_port=create_multimodal_meal_port(),
    )
    assert result.status == MultiAgentWorkflowStatus.COMPLETED
    assert "7.5 g protein" in result.response.text
    assert len(calls) == 2
    assert calls[0]["schema"] == "GeminiMultimodalMealOutput"
    assert calls[0]["media"] is not None
    # Supervisor synthesis does not duplicate raw media bytes after NutritionAgent analyzed it.
    assert calls[1]["media"] is None


def test_coach_chat_rejects_disguised_svg_attachment_before_calling_llm(
    client: TestClient,
    fake_llm: FakeLlm,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_COACH_MULTI_AGENT_ENABLED", "true")
    payload = load_request("full")
    payload["image"] = {
        "mimeType": "image/png",
        "base64": base64.b64encode(b'<svg xmlns="http://www.w3.org/2000/svg"></svg>').decode(),
    }
    token = make_token(scope="ai:coach:chat", sub="11111111-1111-1111-1111-111111111111")
    resp = client.post(COACH_URL, json=payload, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "INVALID_REQUEST"
    assert fake_llm.calls == []


def test_multimodal_endpoint_threads_jwt_user_id_into_llm_calls(
    client: TestClient,
    fake_llm: FakeLlm,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen_users: list[str | None] = []
    orig = fake_llm.generate_text

    async def _capture_user(*args: Any, **kwargs: Any) -> LlmResult:
        seen_users.append(kwargs.get("user_id"))
        fake_llm.text = json.dumps(
            {
                "isFood": True,
                "summary": "Dosa",
                "transcript": "dosa",
                "detectedLanguage": "tanglish",
                "confidence": "high",
                "items": [
                    {
                        "name": "Dosa",
                        "portionDescription": "1 piece",
                        "servingWeightG": 80,
                        "servingUnit": "piece",
                        "servingSize": 1,
                        "calories": 130,
                        "proteinG": 3.0,
                        "carbsG": 22.0,
                        "fatG": 3.5,
                        "fiberG": 1.0,
                        "confidence": "high",
                    }
                ],
            }
        )
        return await orig(*args, **kwargs)

    monkeypatch.setattr(fake_llm, "generate_text", _capture_user)

    token = make_token(scope="ai:meals:multimodal", sub="22222222-2222-2222-2222-222222222222")
    resp = client.post(
        MULTIMODAL_URL,
        json={
            "transcript": "oru dosai",
            "model": {"primary": "gemini-3.5-flash-lite", "fallback": None},
            "deadlineMs": 15000,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert seen_users == ["22222222-2222-2222-2222-222222222222"]
