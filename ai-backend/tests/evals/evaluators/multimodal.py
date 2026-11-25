"""Offline evaluator and executable runner for Phase 15 multimodal AI benchmarks."""

import asyncio
import base64
import json
import struct
from collections.abc import Sequence
from types import SimpleNamespace
from typing import Any

from pydantic import BaseModel, ValidationError
from tests.evals.evaluators.multilingual import MultilingualAccuracyEvaluator
from tests.evals.evaluators.nutrition import NutritionToleranceEvaluator
from tests.evals.evaluators.safety import SafetyEvaluator
from tests.evals.schemas import EvaluationMetricResult, NutritionMacroTolerance

from onusfit_ai.features.meals.application.multimodal import analyze_multimodal_meal
from onusfit_ai.features.meals.application.photo import analyze_meal_photo
from onusfit_ai.features.meals.application.voice import parse_voice_meal
from onusfit_ai.features.meals.domain.multimodal import AnalyzeMultimodalMealRequest
from onusfit_ai.features.meals.domain.photo import AnalyzeMealPhotoRequest
from onusfit_ai.features.meals.domain.voice import ParseVoiceMealRequest
from onusfit_ai.features.speech.application.contracts import TranscribeRequest
from onusfit_ai.features.speech.application.transcribe import transcribe_audio
from onusfit_ai.shared.llm.errors import LlmServiceError
from onusfit_ai.shared.llm.gemini import GeminiClient
from onusfit_ai.shared.llm.ports import LlmResult, LlmUsage, MediaInput
from onusfit_ai.shared.utils.media import InvalidMediaError


class _OfflineMockLlm:
    """Deterministic zero-network TextGenerator used by offline multimodal evaluations."""

    def __init__(self, *, text: str = "", finish_reason: str | None = None) -> None:
        self.text = text
        self.finish_reason = finish_reason
        self.calls: list[dict[str, Any]] = []

    async def generate_text(
        self,
        prompt: str,
        *,
        primary_model: str,
        fallback_model: str | None,
        deadline_s: float,
        media: MediaInput | Sequence[MediaInput] | None = None,
        schema: type[BaseModel] | None = None,
        tools: list[Any] | None = None,
        tool_handler: Any | None = None,
        max_tool_rounds: int = 3,
        max_total_tool_calls: int = 5,
        max_total_tokens: int | None = None,
        **kwargs: Any,
    ) -> LlmResult:
        self.calls.append(
            {
                "prompt": prompt,
                "primary": primary_model,
                "fallback": fallback_model,
                "deadline_s": deadline_s,
                "media": media,
                "schema": schema,
                "tools": tools,
                "tool_handler": tool_handler,
                "max_tool_rounds": max_tool_rounds,
                "max_total_tool_calls": max_total_tool_calls,
                "max_total_tokens": max_total_tokens,
                **kwargs,
            }
        )
        parsed_val: Any | None = None
        if schema is not None and self.text:
            try:
                data = json.loads(self.text)
                if isinstance(data, dict):
                    parsed_val = schema.model_validate(data)
            except Exception:
                parsed_val = None
        return LlmResult(
            text=self.text,
            parsed=parsed_val,
            finish_reason=self.finish_reason,
            tool_calls=[],
            usage=LlmUsage(
                model=primary_model,
                is_fallback=False,
                input_tokens=100,
                output_tokens=20,
                cached_tokens=0,
                thinking_tokens=5,
                total_tokens=125,
                duration_ms=321,
            ),
        )


def _png_bytes(width: int = 320, height: int = 240) -> bytes:
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR" + ihdr + b"\x00\x00\x00\x00"


def _jpeg_valid() -> bytes:
    return b"\xff\xd8\xff\xe0\x00\x10JFIF" + (b"\x00" * 16) + b"\xff\xd9"


def _jpeg_with_exif() -> bytes:
    exif = b"Exif\x00\x00GPS_LAT=13.0827"
    return (
        b"\xff\xd8\xff\xe1"
        + struct.pack(">H", len(exif) + 2)
        + exif
        + b"\xff\xda\x00\x08\x01\x01\x00\x00\x3f\x00px\xff\xd9"
    )


def _wav_bytes(seconds: float, byte_rate: int = 16_000) -> bytes:
    data_size = int(seconds * byte_rate)
    fmt_chunk = b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, 8000, byte_rate, 2, 16)
    data_chunk = b"data" + struct.pack("<I", data_size) + (b"\x00" * 16)
    return (
        b"RIFF"
        + struct.pack("<I", 4 + len(fmt_chunk) + len(data_chunk))
        + b"WAVE"
        + fmt_chunk
        + data_chunk
    )


def _resolve_image_b64(inp: dict[str, Any]) -> str | None:
    if "raw_image_bytes" in inp:
        kind = inp["raw_image_bytes"]
        if kind == "svg_script":
            return base64.b64encode(b'<svg onload="alert(1)"></svg>').decode()
        if kind == "jpeg_zip_polyglot":
            return base64.b64encode(b"\xff\xd8\xff\xe0\x00\x10JFIF\xff\xd9PK\x03\x04zip").decode()
        if kind == "png_dimension_bomb":
            return base64.b64encode(_png_bytes(9000, 9000)).decode()
        if kind == "avif_brand":
            return base64.b64encode(b"\x00\x00\x00\x18ftypavif\x00\x00\x00\x00").decode()
    kind = inp.get("image_kind")
    if kind == "png_valid":
        return base64.b64encode(_png_bytes()).decode()
    if kind == "jpeg_valid":
        return base64.b64encode(_jpeg_valid()).decode()
    if kind == "jpeg_with_exif":
        return base64.b64encode(_jpeg_with_exif()).decode()
    return None


def _resolve_audio_b64(inp: dict[str, Any]) -> str | None:
    if "raw_audio_base64" in inp:
        return str(inp["raw_audio_base64"])
    if inp.get("raw_audio_bytes") == "pdf_header":
        return base64.b64encode(b"%PDF-1.7 disguised audio").decode()
    kind = inp.get("audio_kind")
    if kind == "wav_short":
        return base64.b64encode(_wav_bytes(3.0)).decode()
    if kind == "wav_90s":
        return base64.b64encode(_wav_bytes(90.0)).decode()
    return None


class MultimodalBenchmarkEvaluator:
    """Validate structured multimodal responses using shared FitOnus eval criteria."""

    def __init__(self) -> None:
        self._nutrition = NutritionToleranceEvaluator()
        self._multilingual = MultilingualAccuracyEvaluator()
        self._safety = SafetyEvaluator()

    def evaluate_case(
        self,
        *,
        case: dict[str, Any],
        response_dict: dict[str, Any] | None,
        prompt_sent: str | None,
        media_sent: Any | None,
    ) -> EvaluationMetricResult:
        """Evaluate outcome, nutrition bounds, multilingual parsing, privacy, and uncertainty."""
        expected: dict[str, Any] = case["expected"]
        reasons: list[str] = []

        if response_dict is None:
            return EvaluationMetricResult(
                metric_name="multimodal_benchmark",
                passed=False,
                score=0.0,
                failure_reasons=["Missing response"],
            )

        if "outcome" in expected and response_dict.get("outcome") != expected["outcome"]:
            reasons.append(
                f"Expected outcome {expected['outcome']}, got {response_dict.get('outcome')}"
            )

        result = response_dict.get("result") or {}
        if "is_food" in expected and result.get("isFood") != expected["is_food"]:
            reasons.append(f"Expected isFood={expected['is_food']}, got {result.get('isFood')}")

        if expected.get("requires_unclear_reason") and not result.get("unclearReason"):
            reasons.append("Expected unclearReason / uncertainty notice when ambiguous or clamped")

        if expected.get("requires_uncertainty_note") and not result.get("uncertaintyNote"):
            reasons.append("Expected explicit uncertaintyNote on multimodal output")

        if expected.get("requires_medical_disclaimer") and not result.get("medicalDisclaimer"):
            reasons.append("Expected non-medical disclaimer on multimodal result")

        if (
            "min_confidence" in expected
            and result.get("overallConfidence", 0.0) < expected["min_confidence"]
        ):
            reasons.append("Confidence lower than expected")

        if (
            "max_confidence" in expected
            and result.get("overallConfidence", 1.0) > expected["max_confidence"]
        ):
            reasons.append("Confidence exceeded safety/uncertainty cap")

        if "total_kcal_range" in expected:
            lo, hi = expected["total_kcal_range"]
            kcal = float(result.get("totalKcal", -1))
            if not (lo <= kcal <= hi):
                reasons.append(f"totalKcal {kcal} outside expected range [{lo}, {hi}]")

        if (
            "max_total_kcal" in expected
            and float(result.get("totalKcal", 0)) > expected["max_total_kcal"]
        ):
            reasons.append("totalKcal exceeded safety limit")

        if "expected_item_confidence" in expected:
            items = result.get("items") or []
            if not items or items[0].get("confidence") != expected["expected_item_confidence"]:
                reasons.append("Item confidence did not match calibrated expectation")

        if (
            "expected_overall_word_conf" in expected
            and result.get("confidence") != expected["expected_overall_word_conf"]
        ):
            reasons.append("Overall word confidence mismatch")

        if "expected_serving_size" in expected:
            items = result.get("items") or []
            if not items or items[0].get("servingSize") != expected["expected_serving_size"]:
                reasons.append("Serving quantity mismatch")

        if "language" in expected:
            multi = self._multilingual.evaluate(
                actual_transcript=result.get("transcript", ""),
                detected_language=result.get("detectedLanguage", "en"),
                expected_language=expected["language"],
                expected_entities=expected.get("entities")
                if case["operation"] == "transcribe_audio"
                else None,
            )
            if not multi.passed:
                reasons.extend(multi.failure_reasons)

        if "entities" in expected and result.get("items"):
            joined_names = " ".join(str(it.get("name", "")).lower() for it in result["items"])
            for ent in expected["entities"]:
                if ent.lower() not in joined_names:
                    reasons.append(f"Missing expected food entity: {ent}")

        if "nutrition_targets" in expected:
            targets = [NutritionMacroTolerance(**t) for t in expected["nutrition_targets"]]
            actual_items = [
                {
                    "name": it.get("name"),
                    "calories": it.get("kcal"),
                    "proteinG": it.get("protein"),
                    "carbsG": it.get("carbs"),
                    "fatG": it.get("fat"),
                    "servingWeightG": it.get("servingWeightG"),
                }
                for it in (result.get("items") or [])
            ]
            nut_res = self._nutrition.evaluate(actual_items, targets)
            if not nut_res.passed:
                reasons.extend(nut_res.failure_reasons)

        if "modalities" in expected and result.get("modalitiesUsed") != expected["modalities"]:
            reasons.append(
                f"Expected modalities {expected['modalities']}, got {result.get('modalitiesUsed')}"
            )

        if (
            "exact_transcript" in expected
            and result.get("transcript") != expected["exact_transcript"]
        ):
            reasons.append("Expected exact empty transcript")

        if prompt_sent is not None:
            if "prompt_contains" in expected and expected["prompt_contains"] not in prompt_sent:
                reasons.append(f"Prompt missing expected text: {expected['prompt_contains']}")
            if "prompt_no_line_prefix" in expected:
                prefix = expected["prompt_no_line_prefix"]
                if any(line.startswith(prefix) for line in prompt_sent.splitlines()):
                    reasons.append(f"Prompt allowed line injection starting with {prefix}")
            for bad in expected.get("prompt_not_contains", []):
                if bad in prompt_sent:
                    reasons.append(f"Prompt contained unneutralized token: {bad}")

        serialized = str(result)
        for bad_out in expected.get("output_not_contains", []):
            if bad_out.lower() in serialized.lower():
                reasons.append(f"Output leaked prohibited token/claim: {bad_out}")
        if "output_contains" in expected and expected["output_contains"] not in serialized:
            reasons.append(
                f"Output missing expected redaction token: {expected['output_contains']}"
            )

        if "strip_exif_marker" in expected:
            marker = expected["strip_exif_marker"].encode()
            media_items = media_sent if isinstance(media_sent, list) else [media_sent]
            if any(m is not None and marker in m.data for m in media_items):
                reasons.append("EXIF privacy marker leaked into forwarded Gemini image bytes")

        if "min_media_parts" in expected:
            media_items = (
                media_sent if isinstance(media_sent, list) else ([media_sent] if media_sent else [])
            )
            if len(media_items) < expected["min_media_parts"]:
                reasons.append("Expected multiple fused MediaInput parts")

        # Shared SafetyEvaluator regression check on summary/unclear_reason text.
        safety_text = f"{result.get('summary', '')} {result.get('unclearReason', '')}".strip()
        if safety_text:
            s_res = self._safety.evaluate(safety_text)
            if not s_res.passed:
                reasons.extend(s_res.failure_reasons)

        return EvaluationMetricResult(
            metric_name="multimodal_benchmark",
            passed=len(reasons) == 0,
            score=1.0 if not reasons else 0.0,
            failure_reasons=reasons,
        )


async def execute_multimodal_offline_case(case: dict[str, Any]) -> EvaluationMetricResult:
    """Execute one Phase 15 multimodal benchmark case against real use cases with mocked Gemini."""
    op = case.get("override_operation") or case["operation"]
    inp: dict[str, Any] = case["input"]
    mock: dict[str, Any] = case.get("mock_llm", {})
    expected: dict[str, Any] = case["expected"]

    if op == "gemini_budget_and_dedup":
        if inp["mode"] == "token_budget_exceeded":

            class DummySdk:
                calls = 0
                aio = SimpleNamespace(models=SimpleNamespace(generate_content=None))

            client = GeminiClient("fake-key", sdk_client=DummySdk())
            media = MediaInput(
                mime_type="image/jpeg", data=b"\xff\xd8\xff" + (b"\x00" * inp["image_bytes_len"])
            )
            try:
                await client.generate_text(
                    "analyze",
                    primary_model="gemini-2.5-flash",
                    fallback_model=None,
                    deadline_s=10,
                    media=media,
                    max_total_tokens=inp["max_total_tokens"],
                )
            except LlmServiceError as exc:
                reasons: list[str] = []
                if exc.code != expected["error_code"]:
                    reasons.append(f"Expected error_code={expected['error_code']}, got {exc.code}")
                if exc.dispatched is not expected["dispatched"]:
                    reasons.append(f"Expected dispatched={expected['dispatched']}, got {exc.dispatched}")
                return EvaluationMetricResult(
                    metric_name="multimodal_benchmark",
                    passed=not reasons,
                    score=1.0 if not reasons else 0.0,
                    failure_reasons=reasons,
                )
            return EvaluationMetricResult(
                metric_name="multimodal_benchmark",
                passed=False,
                score=0.0,
                failure_reasons=["Expected LlmServiceError on token budget exceeded"],
            )

        class DedupSdk:
            def __init__(self) -> None:
                self.calls = 0
                self.aio = SimpleNamespace(models=SimpleNamespace(generate_content=self._gen))

            async def _gen(self, **_kwargs: Any) -> Any:
                self.calls += 1
                await asyncio.sleep(0.01)
                return SimpleNamespace(
                    text=mock["text"],
                    parsed=None,
                    candidates=[],
                    usage_metadata=SimpleNamespace(
                        prompt_token_count=10,
                        candidates_token_count=5,
                        total_token_count=15,
                    ),
                )

        sdk = DedupSdk()
        client = GeminiClient("fake-key", sdk_client=sdk)
        results = await asyncio.gather(
            *[
                client.generate_text(
                    "same",
                    primary_model="gemini-2.5-flash",
                    fallback_model=None,
                    deadline_s=10,
                    media=MediaInput(mime_type="image/png", data=_png_bytes()),
                    user_id="bench-dedup-user",
                )
                for _ in range(inp["repeat_count"])
            ]
        )
        reasons = []
        if sdk.calls != expected["sdk_calls"]:
            reasons.append(f"Expected sdk_calls={expected['sdk_calls']}, got {sdk.calls}")
        if not all(r.text == expected["all_texts"] for r in results):
            reasons.append("Deduplicated results mismatch")
        return EvaluationMetricResult(
            metric_name="multimodal_benchmark",
            passed=not reasons,
            score=1.0 if not reasons else 0.0,
            failure_reasons=reasons,
        )

    raw_text = json.dumps(mock["json"]) if "json" in mock else str(mock.get("text", ""))
    llm = _OfflineMockLlm(text=raw_text, finish_reason=mock.get("finish_reason"))
    model = {"primary": "gemini-2.5-flash", "fallback": "gemini-2.0-flash"}

    raises = expected.get("raises")
    if raises == "ValidationError":
        try:
            AnalyzeMultimodalMealRequest.model_validate({"model": model, "deadlineMs": 15000})
        except ValidationError:
            return EvaluationMetricResult(
                metric_name="multimodal_benchmark", passed=True, score=1.0
            )
        return EvaluationMetricResult(
            metric_name="multimodal_benchmark",
            passed=False,
            score=0.0,
            failure_reasons=["Expected ValidationError"],
        )

    async def _run_op() -> dict[str, Any]:
        if op == "parse_voice_meal":
            audio_b64 = _resolve_audio_b64(inp)
            payload: dict[str, Any] = {
                "transcript": inp.get("transcript"),
                "lang": inp.get("lang"),
                "mealType": inp.get("meal_type"),
                "model": model,
                "deadlineMs": 20000,
            }
            if audio_b64 is not None:
                payload["audio"] = {
                    "mimeType": inp.get("mime_type", "audio/m4a"),
                    "base64": audio_b64,
                }
            req = ParseVoiceMealRequest.model_validate(payload)
            return (
                await parse_voice_meal(req, llm, trace_id=case["case_id"], user_id="eval-user")
            ).model_dump(by_alias=True)

        if op == "transcribe_audio":
            audio_b64 = _resolve_audio_b64(inp) or ""
            req_t = TranscribeRequest.model_validate(
                {
                    "audio": {"mimeType": inp.get("mime_type", "audio/wav"), "base64": audio_b64},
                    "model": model,
                    "deadlineMs": 20000,
                }
            )
            return (
                await transcribe_audio(req_t, llm, trace_id=case["case_id"], user_id="eval-user")
            ).model_dump(by_alias=True)

        if op == "analyze_meal_photo":
            img_b64 = _resolve_image_b64(inp) or ""
            req_p = AnalyzeMealPhotoRequest.model_validate(
                {
                    "image": {"mimeType": inp.get("mime_type", "image/jpeg"), "base64": img_b64},
                    "mealType": inp.get("meal_type"),
                    "notes": inp.get("notes"),
                    "model": model,
                    "deadlineMs": 20000,
                }
            )
            return (
                await analyze_meal_photo(req_p, llm, trace_id=case["case_id"], user_id="eval-user")
            ).model_dump(by_alias=True)

        img_b64 = _resolve_image_b64(inp)
        audio_b64 = _resolve_audio_b64(inp)
        mm_payload: dict[str, Any] = {
            "transcript": inp.get("transcript"),
            "context": inp.get("context"),
            "model": model,
            "deadlineMs": 20000,
        }
        if img_b64 is not None:
            mm_payload["image"] = {
                "mimeType": inp.get("mime_type", "image/jpeg"),
                "base64": img_b64,
            }
        if audio_b64 is not None:
            mm_payload["audio"] = {
                "mimeType": inp.get("audio_mime_type", "audio/wav"),
                "base64": audio_b64,
            }
        req_m = AnalyzeMultimodalMealRequest.model_validate(mm_payload)
        return (
            await analyze_multimodal_meal(
                req_m, llm, trace_id=case["case_id"], user_id="eval-user"
            )
        ).model_dump(by_alias=True)

    if raises == "InvalidMediaError":
        try:
            await _run_op()
        except InvalidMediaError as media_exc:
            reasons = []
            if "error_contains" in expected and expected["error_contains"].lower() not in str(
                media_exc
            ).lower():
                reasons.append(f"Unexpected InvalidMediaError message: {media_exc}")
            if expected.get("zero_llm_calls") and llm.calls:
                reasons.append("LLM was called despite invalid media")
            return EvaluationMetricResult(
                metric_name="multimodal_benchmark",
                passed=not reasons,
                score=1.0 if not reasons else 0.0,
                failure_reasons=reasons,
            )
        return EvaluationMetricResult(
            metric_name="multimodal_benchmark",
            passed=False,
            score=0.0,
            failure_reasons=["Expected InvalidMediaError"],
        )

    if raises == "LlmServiceError":
        try:
            await _run_op()
        except LlmServiceError as svc_exc:
            reasons = []
            if "error_code" in expected and svc_exc.code != expected["error_code"]:
                reasons.append(f"Expected error_code={expected['error_code']}, got {svc_exc.code}")
            if "dispatched" in expected and svc_exc.dispatched is not expected["dispatched"]:
                reasons.append(f"Expected dispatched={expected['dispatched']}, got {svc_exc.dispatched}")
            return EvaluationMetricResult(
                metric_name="multimodal_benchmark",
                passed=not reasons,
                score=1.0 if not reasons else 0.0,
                failure_reasons=reasons,
            )
        return EvaluationMetricResult(
            metric_name="multimodal_benchmark",
            passed=False,
            score=0.0,
            failure_reasons=["Expected LlmServiceError"],
        )

    response_dict = await _run_op()
    call = llm.calls[0] if llm.calls else {}
    return MultimodalBenchmarkEvaluator().evaluate_case(
        case=case,
        response_dict=response_dict,
        prompt_sent=call.get("prompt"),
        media_sent=call.get("media"),
    )
