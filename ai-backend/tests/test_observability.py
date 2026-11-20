"""AI observability: structured logs, correlation ids, error categories and privacy.

These tests read what the service actually writes to stdout (JSON lines), end to end through the real
ASGI app, so they prove what Render would show, not what a helper function returns.
"""

import base64
import json
import logging
from typing import Any

import pytest
from fastapi.testclient import TestClient

from conftest import FakeLlm, JsonLogs, load_request, make_token
from onusfit_ai.main import create_app
from onusfit_ai.shared.errors import AiError
from onusfit_ai.shared.llm.dependencies import get_llm
from onusfit_ai.shared.llm.errors import LlmServiceError, ModelCooldown
from onusfit_ai.shared.llm.gemini import GeminiClient
from onusfit_ai.shared.llm.telemetry import INVALID_OUTPUT_OUTCOMES
from onusfit_ai.shared.logging import (
    clean_fields,
    configure_logging,
    log_event,
    redact,
)
from onusfit_ai.shared.observability import (
    FEATURE_BY_PATH,
    category_for_error_code,
    category_for_gemini_kind,
    safe_id,
)
from test_coach_insights_api import GOOD_REPLY as INSIGHTS_REPLY
from test_coach_insights_api import body as insights_body
from test_gemini_client import (
    FakeSdk,
    auth_error,
    daily_quota,
    make_response,
    overloaded,
    rate_limit,
)
from test_meal_photo_api import GOOD_REPLY as PHOTO_REPLY
from test_meal_photo_api import body as photo_body
from test_transcribe_api import GOOD_REPLY as STT_REPLY
from test_transcribe_api import body as stt_body
from test_voice_meal_api import GOOD_REPLY as VOICE_REPLY
from test_voice_meal_api import body as voice_body

# Built at runtime so the repository never contains a literal that looks like a real key.
GOOGLE_KEY = "AI" + "za" + "SyFAKE-FAKE-FAKE-FAKE-FAKE-1234567"
FAKE_JWT = ".".join(
    ["ey" + "JhbGciOiJIUzI1NiJ9", "ey" + "JzdWIiOiIxMjM0NTY3ODkwIn0", "c2lnbmF0dXJl"]
)
CORRELATION = "mobile-request-7f3a9c1e"
AI_REQUEST = "chat-lx3k9a-abc123"


def headers(scope: str, **extra: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(scope=scope)}", **extra}


# One entry per endpoint: url, scope, the Python feature name, a request, and a reply the fake model gives.
ENDPOINTS: dict[str, dict[str, Any]] = {
    "coach_chat": {
        "url": "/internal/v1/ai/coach/chat",
        "scope": "ai:coach:chat",
        "request": lambda: load_request("full"),
        "reply": None,  # the FakeLlm default is a valid coach reply
    },
    "coach_insights": {
        "url": "/internal/v1/ai/coach/insights",
        "scope": "ai:coach:insights",
        "request": insights_body,
        "reply": INSIGHTS_REPLY,
    },
    "voice_meal": {
        "url": "/internal/v1/ai/meals/parse-voice",
        "scope": "ai:meals:voice",
        "request": voice_body,
        "reply": VOICE_REPLY,
    },
    "meal_photo": {
        "url": "/internal/v1/ai/meals/analyze-photo",
        "scope": "ai:meals:photo",
        "request": lambda: photo_body(mealType="breakfast", notes="hospital diet plan number 4471"),
        "reply": PHOTO_REPLY,
    },
    "transcribe": {
        "url": "/internal/v1/ai/speech/transcribe",
        "scope": "ai:speech:transcribe",
        "request": stt_body,
        "reply": STT_REPLY,
    },
}


def post(
    client: TestClient,
    feature: str,
    *,
    extra_headers: dict[str, str] | None = None,
    **overrides: Any,
):  # type: ignore[no-untyped-def]
    spec = ENDPOINTS[feature]
    payload = spec["request"]()
    payload.update(overrides)
    return client.post(
        spec["url"], json=payload, headers=headers(spec["scope"], **(extra_headers or {}))
    )


@pytest.fixture
def served(fake_llm: FakeLlm, client: TestClient):  # type: ignore[no-untyped-def]
    """Returns a function that sets the fake model's reply for a feature, then yields the client."""

    def prepare(feature: str) -> TestClient:
        reply = ENDPOINTS[feature]["reply"]
        if reply is not None:
            fake_llm.text = reply
        return client

    return prepare


# --------------------------------------------------------------------------------------------------
# Structured format


class TestStructuredFormat:
    def test_every_line_is_one_json_object_with_the_shared_field_names(
        self, json_logs: JsonLogs
    ) -> None:
        log_event(
            logging.getLogger("onusfit_ai.test"), "ai.example", message="hello", totalTokens=5
        )

        (entry,) = json_logs.entries()
        assert entry["service"] == "onusfit-ai-backend"
        assert entry["level"] == "info"
        assert entry["event"] == "ai.example" and entry["msg"] == "hello"
        assert entry["totalTokens"] == 5
        assert entry["time"].endswith("Z") and entry["logger"] == "onusfit_ai.test"

    def test_level_names_match_what_the_node_api_writes(self, json_logs: JsonLogs) -> None:
        logger = logging.getLogger("onusfit_ai.test")
        log_event(logger, "a", level=logging.WARNING)
        log_event(logger, "b", level=logging.CRITICAL)
        assert [e["level"] for e in json_logs.entries()] == ["warn", "fatal"]

    def test_a_message_cannot_forge_a_second_log_line(self, json_logs: JsonLogs) -> None:
        forged = 'x"\n{"event":"ai.call.completed","success":true}'
        logging.getLogger("onusfit_ai.test").info(forged)
        assert len(json_logs.entries()) == 1  # JSON escapes the newline

    def test_text_format_stays_available_for_local_development(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        configure_logging("INFO", "text")
        log_event(logging.getLogger("onusfit_ai.test"), "ai.example", message="hello", model="m")
        line = capsys.readouterr().out.strip()
        assert "INFO onusfit_ai.test hello" in line and 'model="m"' in line
        assert not line.startswith("{")

    def test_switching_format_replaces_the_formatter_without_a_second_handler(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        configure_logging("INFO", "text")
        configure_logging("INFO", "json")
        logging.getLogger("onusfit_ai.test").info("once")
        assert capsys.readouterr().out.count("once") == 1


# --------------------------------------------------------------------------------------------------
# Redaction and field cleaning


class TestRedaction:
    def test_sensitive_field_names_are_masked_but_metadata_names_are_not(self) -> None:
        cleaned = clean_fields(
            {
                "message": "my knee hurts",
                "prompt": "full prompt",
                "context": {"a": 1},
                "base64": "AAAA",
                "Authorization": "Bearer x",
                "api_key": "k",
                "user-id": "u",
                "totalTokens": 12,
                "promptVersion": "v3",
                "model": "gemini-x",
            }
        )
        assert [k for k, v in cleaned.items() if v == "[redacted]"] == [
            "message", "prompt", "context", "base64", "Authorization", "api_key", "user-id",
        ]  # fmt: skip
        assert cleaned["totalTokens"] == 12 and cleaned["promptVersion"] == "v3"
        assert cleaned["model"] == "gemini-x"

    def test_only_primitives_are_logged_and_text_is_bounded(self) -> None:
        class Holder:
            secret_stuff = "SENTINEL"

        cleaned = clean_fields(
            {
                "obj": Holder(),
                "mapping": {"x": "SENTINEL"},
                "long": "z" * 1000,
                "names": ["a", "b", {"nested": "SENTINEL"}] + ["c"] * 20,
                "nan": float("nan"),
            }
        )
        assert cleaned["obj"] == "<Holder>" and cleaned["mapping"] == "<dict>"
        assert len(cleaned["long"]) == 200
        assert cleaned["names"][:3] == ["a", "b", "c"] and len(cleaned["names"]) <= 10
        assert cleaned["nan"] is None
        assert "SENTINEL" not in json.dumps(cleaned)

    def test_keys_tokens_and_jwts_inside_values_are_masked_in_the_final_line(
        self, json_logs: JsonLogs
    ) -> None:
        log_event(
            logging.getLogger("onusfit_ai.test"),
            "ai.example",
            message=f"a {GOOGLE_KEY} b Bearer abc.def-123",
            note=f"jwt {FAKE_JWT} end",
        )
        out = json_logs.entries()[0]
        text = json.dumps(out)
        assert GOOGLE_KEY not in text and FAKE_JWT not in text and "abc.def-123" not in text
        assert "[redacted-api-key]" in out["msg"] and "[redacted-jwt]" in out["note"]

    def test_redact_leaves_ordinary_text_alone(self) -> None:
        assert (
            redact("model=gemini-3.5-flash-lite tokens=1050")
            == "model=gemini-3.5-flash-lite tokens=1050"
        )


# --------------------------------------------------------------------------------------------------
# Correlation ids


class TestCorrelation:
    def test_every_line_of_a_request_carries_the_ids_and_the_feature(
        self, client: TestClient, json_logs: JsonLogs
    ) -> None:
        response = client.post(
            ENDPOINTS["coach_chat"]["url"],
            json=load_request("full"),
            headers=headers(
                "ai:coach:chat",
                **{"X-Correlation-Id": CORRELATION, "X-Request-Id": AI_REQUEST},
            ),
        )
        assert response.status_code == 200 and response.json()["traceId"] == AI_REQUEST

        entries = json_logs.entries()
        assert {e["event"] for e in entries} == {"ai.call.completed", "http.request"}
        for entry in entries:
            assert entry["correlationId"] == CORRELATION
            assert entry["aiRequestId"] == AI_REQUEST
            assert entry["feature"] == "coach_chat"

    def test_ids_do_not_leak_into_the_next_request(
        self, client: TestClient, json_logs: JsonLogs
    ) -> None:
        post(client, "coach_chat", extra_headers={"X-Correlation-Id": CORRELATION})
        assert CORRELATION in json_logs.text
        json_logs.clear()

        post(client, "coach_chat")  # no correlation header this time

        assert "correlationId" not in json.dumps(json_logs.entries())
        assert CORRELATION not in json_logs.text

    @pytest.mark.parametrize(
        "unsafe", ["has spaces in it", "x" * 200, "short", "<script>alert(1)</script>", "a\tb" * 5]
    )
    def test_an_unsafe_correlation_id_is_ignored_never_logged(
        self, client: TestClient, json_logs: JsonLogs, unsafe: str
    ) -> None:
        # httpx rejects raw CR/LF in header values itself, so those cannot even be sent.
        post(client, "coach_chat", extra_headers={"X-Correlation-Id": unsafe})
        entries = json_logs.entries()
        assert entries and all("correlationId" not in e for e in entries)
        assert unsafe not in json_logs.text

    def test_safe_id_rule_matches_the_node_api(self) -> None:
        assert safe_id("mobile-request-1234") == "mobile-request-1234"
        assert safe_id("550e8400-e29b-41d4-a716-446655440000")
        for bad in [None, "", "short", "has space here", "x" * 129, "semi;colon-id"]:
            assert safe_id(bad) is None

    def test_the_access_line_has_method_path_status_and_duration_but_no_body(
        self, client: TestClient, json_logs: JsonLogs
    ) -> None:
        post(client, "coach_chat")
        (access,) = json_logs.events("http.request")
        assert access["method"] == "POST" and access["path"] == "/internal/v1/ai/coach/chat"
        assert access["httpStatus"] == 200 and access["level"] == "info"
        assert isinstance(access["durationMs"], int) and access["durationMs"] >= 0

    def test_health_checks_are_not_logged(self, client: TestClient, json_logs: JsonLogs) -> None:
        assert client.get("/health/live").status_code == 200
        assert json_logs.entries() == []

    def test_every_internal_ai_route_has_a_feature_name(self) -> None:
        # The public OpenAPI endpoint is disabled, but the schema can still be generated in code.
        internal = {p for p in create_app().openapi()["paths"] if p.startswith("/internal/v1/ai/")}
        assert internal and internal == set(FEATURE_BY_PATH)


# --------------------------------------------------------------------------------------------------
# What a completed call records


class TestCompletedCallEvent:
    @pytest.mark.parametrize("feature", list(ENDPOINTS))
    def test_every_feature_logs_the_same_metadata(
        self, served: Any, json_logs: JsonLogs, feature: str
    ) -> None:
        response = post(served(feature), feature, extra_headers={"X-Request-Id": AI_REQUEST})
        assert response.status_code == 200

        (event,) = json_logs.events("ai.call.completed")
        assert event["feature"] == feature
        assert event["aiRequestId"] == AI_REQUEST
        assert event["success"] is True and event["outcome"] == "ok"
        assert event["errorCategory"] is None
        assert event["model"] == "gemini-3.5-flash-lite" or event["model"].startswith("gemini")
        assert event["modelFallbackUsed"] is False
        assert (event["inputTokens"], event["outputTokens"], event["cachedTokens"]) == (100, 20, 0)
        assert (event["thinkingTokens"], event["totalTokens"]) == (5, 125)
        assert event["geminiDurationMs"] == 321
        assert isinstance(event["promptVersion"], str) and event["promptVersion"]

    def test_the_backup_model_is_reported(
        self,
        client: TestClient,
        fake_llm: FakeLlm,
        json_logs: JsonLogs,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        original = fake_llm.generate_text

        async def via_backup(*args: Any, **kwargs: Any):  # type: ignore[no-untyped-def]
            result = await original(*args, **kwargs)
            usage = type(result.usage)(
                **{**result.usage.__dict__, "model": "backup", "is_fallback": True}
            )
            return type(result)(text=result.text, usage=usage)

        monkeypatch.setattr(fake_llm, "generate_text", via_backup)
        post(client, "coach_chat")
        event = json_logs.events("ai.call.completed")[0]
        assert event["model"] == "backup" and event["modelFallbackUsed"] is True

    @pytest.mark.parametrize(
        ("feature", "reply"),
        [
            ("coach_chat", "plain prose, not json"),
            ("coach_insights", "not json at all"),
            ("voice_meal", "not json at all"),
            ("meal_photo", "not json at all"),
            ("transcribe", "not json at all"),
        ],
    )
    def test_unusable_model_output_is_success_false_invalid_ai_response(
        self, client: TestClient, fake_llm: FakeLlm, json_logs: JsonLogs, feature: str, reply: str
    ) -> None:
        fake_llm.text = reply
        post(client, feature)
        (event,) = json_logs.events("ai.call.completed")
        assert event["outcome"] in INVALID_OUTPUT_OUTCOMES
        assert event["success"] is False and event["errorCategory"] == "invalid_ai_response"

    def test_a_photo_without_food_is_a_valid_answer_not_a_failure(
        self, client: TestClient, fake_llm: FakeLlm, json_logs: JsonLogs
    ) -> None:
        fake_llm.text = json.dumps({"isFood": False, "summary": "a desk", "items": []})
        post(client, "meal_photo")
        (event,) = json_logs.events("ai.call.completed")
        assert event["outcome"] == "no_food" and event["success"] is True
        assert event["errorCategory"] is None

    def test_per_feature_counts_are_logged_as_numbers(
        self, served: Any, json_logs: JsonLogs
    ) -> None:
        post(served("meal_photo"), "meal_photo")
        (event,) = json_logs.events("ai.call.completed")
        assert event["items"] == 1 and event["imageBytes"] > 0

    def test_no_metadata_field_is_masked_by_the_sensitive_name_filter(
        self, served: Any, json_logs: JsonLogs
    ) -> None:
        """Every per-feature field is real metadata; a name on the sensitive list would hide its value."""
        for feature in ENDPOINTS:
            post(served(feature), feature)
        events = json_logs.events("ai.call.completed")
        assert len(events) == len(ENDPOINTS)
        for event in events:
            masked = [name for name, value in event.items() if value == "[redacted]"]
            assert masked == [], f"{event['feature']} has masked fields: {masked}"

    def test_voice_meal_reports_whether_audio_was_sent(
        self, served: Any, json_logs: JsonLogs
    ) -> None:
        post(served("voice_meal"), "voice_meal")
        (event,) = json_logs.events("ai.call.completed")
        assert (
            event["hasAudio"] is False and event["items"] == 1
        )  # the default request is transcript-only


# --------------------------------------------------------------------------------------------------
# Failures and their categories


def failing(
    code: str, status: int, *, dispatched: bool = True, retry: int | None = None
) -> AiError:
    return AiError(
        status_code=status,
        code=code,
        message=f"SENTINEL_PROVIDER_TEXT {GOOGLE_KEY} Bearer {FAKE_JWT}",
        retry_after_seconds=retry,
        dispatched=dispatched,
    )


class TestFailureEvents:
    @pytest.mark.parametrize(
        ("code", "status", "category", "level"),
        [
            ("PROVIDER_TIMEOUT", 504, "gemini_timeout", "error"),
            ("PROVIDER_RATE_LIMITED", 429, "gemini_rate_limited", "warn"),
            ("PROVIDER_QUOTA_EXHAUSTED", 429, "gemini_quota_exhausted", "warn"),
            ("PROVIDER_UNAVAILABLE", 503, "gemini_unavailable", "error"),
            ("AI_UNAVAILABLE", 503, "gemini_unavailable", "error"),
            ("PROVIDER_AUTH_ERROR", 503, "gemini_auth", "error"),
            ("PROVIDER_NOT_CONFIGURED", 503, "gemini_auth", "error"),
            ("PROVIDER_ERROR", 503, "gemini_error", "error"),
        ],
    )
    def test_gemini_failures_are_categorised_without_their_text(
        self, client: TestClient, fake_llm: FakeLlm, json_logs: JsonLogs,
        code: str, status: int, category: str, level: str,
    ) -> None:  # fmt: skip
        fake_llm.error = failing(code, status, retry=25)

        response = post(client, "coach_chat", extra_headers={"X-Correlation-Id": CORRELATION})

        assert response.status_code == status  # the public answer is unchanged
        (event,) = json_logs.events("ai.request.failed")
        expected = {
            "success": False, "errorCode": code, "errorCategory": category, "httpStatus": status,
            "dispatched": True, "retryAfterSeconds": 25, "level": level,
            "correlationId": CORRELATION, "feature": "coach_chat",
        }  # fmt: skip
        assert event.items() >= expected.items()
        assert "SENTINEL_PROVIDER_TEXT" not in json_logs.text

    def test_authentication_failure(self, client: TestClient, json_logs: JsonLogs) -> None:
        spec = ENDPOINTS["coach_chat"]
        response = client.post(
            spec["url"],
            json=spec["request"](),
            headers={"Authorization": "Bearer not-a-real-token", "X-Correlation-Id": CORRELATION},
        )

        assert response.status_code == 401
        (event,) = json_logs.events("ai.request.failed")
        assert (
            event["errorCode"] == "AUTH_INVALID_TOKEN" and event["errorCategory"] == "auth_failure"
        )
        assert event["httpStatus"] == 401 and event["dispatched"] is False
        assert event["correlationId"] == CORRELATION
        (access,) = json_logs.events("http.request")
        assert access["httpStatus"] == 401 and access["level"] == "warn"
        assert "not-a-real-token" not in json_logs.text

    def test_a_wrong_scope_is_also_an_authentication_failure(
        self, client: TestClient, json_logs: JsonLogs
    ) -> None:
        spec = ENDPOINTS["coach_chat"]
        client.post(spec["url"], json=spec["request"](), headers=headers("ai:meals:photo"))
        assert json_logs.events("ai.request.failed")[0]["errorCategory"] == "auth_failure"

    def test_a_missing_token_is_logged_too(self, client: TestClient, json_logs: JsonLogs) -> None:
        client.post(ENDPOINTS["coach_chat"]["url"], json=load_request("full"))
        assert json_logs.events("ai.request.failed")[0]["errorCategory"] == "auth_failure"

    def test_service_authentication_not_configured(
        self, client: TestClient, json_logs: JsonLogs, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.delenv("AI_SERVICE_JWT_SECRET")
        post(client, "coach_chat")
        event = json_logs.events("ai.request.failed")[0]
        assert (
            event["errorCode"] == "AUTH_NOT_CONFIGURED" and event["errorCategory"] == "auth_failure"
        )

    def test_validation_failure_logs_field_names_never_values(
        self, client: TestClient, json_logs: JsonLogs
    ) -> None:
        spec = ENDPOINTS["coach_chat"]
        payload = spec["request"]()
        payload["message"] = 12345  # wrong type
        payload["SENTINEL_UNKNOWN_FIELD_NAME_" + "q" * 100] = "SENTINEL_VALUE_I_weigh_91kg"

        response = client.post(spec["url"], json=payload, headers=headers(spec["scope"]))

        assert response.status_code == 422
        (event,) = json_logs.events("ai.request.failed")
        assert (
            event["errorCode"] == "INVALID_REQUEST" and event["errorCategory"] == "invalid_request"
        )
        assert event["httpStatus"] == 422 and event["dispatched"] is False
        assert "message" in event["invalidFields"] and len(event["invalidFields"]) <= 5
        assert all(len(name) <= 60 for name in event["invalidFields"])
        assert "SENTINEL_VALUE" not in json_logs.text and "12345" not in json_logs.text

    def test_an_unhandled_error_logs_its_type_only_and_the_response_is_unchanged(
        self, fake_llm: FakeLlm, json_logs: JsonLogs
    ) -> None:
        app = create_app()
        app.dependency_overrides[get_llm] = lambda: fake_llm
        fake_llm.error = RuntimeError(f"boom SENTINEL_EXCEPTION_TEXT {GOOGLE_KEY}")
        spec = ENDPOINTS["coach_chat"]

        response = TestClient(app, raise_server_exceptions=False).post(
            spec["url"], json=spec["request"](), headers=headers(spec["scope"])
        )

        assert response.status_code == 500 and response.text == "Internal Server Error"
        (event,) = json_logs.events("http.unhandled_error")
        assert event["errorType"] == "RuntimeError" and event["errorCategory"] == "internal_error"
        assert event["level"] == "error"
        assert "SENTINEL_EXCEPTION_TEXT" not in json_logs.text and GOOGLE_KEY not in json_logs.text
        assert json_logs.events("http.request")[0]["httpStatus"] == 500

    def test_category_tables_cover_every_code_and_kind_the_service_can_raise(self) -> None:
        assert category_for_error_code("SOMETHING_NEW") == "internal_error"
        assert category_for_gemini_kind("SOMETHING_NEW") == "gemini_error"
        for kind in ("TIMEOUT", "RATE_LIMIT_RPM", "QUOTA_EXHAUSTED_RPD", "HIGH_DEMAND_503",
                     "MODEL_NOT_FOUND", "AUTH_ERROR", "UNKNOWN"):  # fmt: skip
            assert category_for_gemini_kind(kind) != "internal_error"


# --------------------------------------------------------------------------------------------------
# Privacy: nothing a user sent, and nothing the model said, is ever logged


def string_leaves(value: Any, skip: frozenset[str] = frozenset({"model"})) -> list[str]:
    """Every string in a JSON value of 8+ characters, except under the `model` key (model names are metadata)."""
    if isinstance(value, str):
        return [value] if len(value) >= 8 else []
    if isinstance(value, dict):
        return [s for k, v in value.items() if k not in skip for s in string_leaves(v, skip)]
    if isinstance(value, list):
        return [s for v in value for s in string_leaves(v, skip)]
    return []


class TestPrivacy:
    @pytest.mark.parametrize("feature", list(ENDPOINTS))
    @pytest.mark.parametrize(
        "scenario", ["success", "unusable", "provider_failure", "bad_token", "invalid_body"]
    )
    def test_no_request_or_reply_content_reaches_the_logs(
        self,
        client: TestClient,
        fake_llm: FakeLlm,
        json_logs: JsonLogs,
        feature: str,
        scenario: str,
    ) -> None:
        spec = ENDPOINTS[feature]
        payload = spec["request"]()
        # Plant recognisable user content wherever the endpoint takes free text.
        for field in ("message", "transcript", "notes"):
            if field in payload:
                payload[field] = f"SENTINEL_{field.upper()}_my_knee_surgery_last_week"
        sent_text = string_leaves(payload)
        reply = spec["reply"] or fake_llm.text
        fake_llm.text = reply
        # Both the whole reply and each text inside it must stay out of the logs.
        reply_text = (
            [reply, *string_leaves(json.loads(reply))] if reply.startswith("{") else [reply]
        )
        request_headers = headers(spec["scope"], **{"X-Correlation-Id": CORRELATION})

        if scenario == "unusable":
            fake_llm.text = "SENTINEL_UNPARSEABLE_MODEL_REPLY_text"
            reply_text = [fake_llm.text]
        elif scenario == "provider_failure":
            fake_llm.error = failing("PROVIDER_UNAVAILABLE", 503)
        elif scenario == "bad_token":
            request_headers = {"Authorization": f"Bearer {FAKE_JWT}"}
        elif scenario == "invalid_body":
            payload["deadlineMs"] = "SENTINEL_NOT_A_NUMBER_value"

        client.post(spec["url"], json=payload, headers=request_headers)

        entries = json_logs.entries()
        assert entries, "the service must log something for every request"
        logged = json_logs.text
        for text in sent_text + reply_text:
            assert text not in logged, f"user/model content leaked into the logs: {text[:40]!r}"
        for forbidden in (
            GOOGLE_KEY,
            FAKE_JWT,
            "Bearer ",
            "SENTINEL",
            "11111111-1111-1111-1111-111111111111",
        ):
            assert forbidden not in logged
        # The audio/image bytes (as base64) are never logged either.
        for media in (payload.get("audio"), payload.get("image")):
            if isinstance(media, dict) and isinstance(media.get("base64"), str):
                assert media["base64"] not in logged
                assert base64.b64decode(media["base64"]).hex() not in logged
        assert all(e["service"] == "onusfit-ai-backend" for e in entries)


# --------------------------------------------------------------------------------------------------
# The Gemini client: attempts, model fallback and cooldown


async def generate(client: GeminiClient) -> Any:
    return await client.generate_text(
        "SENTINEL_PROMPT_TEXT", primary_model="primary", fallback_model="fallback", deadline_s=10
    )


class TestGeminiAttemptEvents:
    async def test_a_failed_primary_logs_the_category_and_that_the_backup_model_will_be_tried(
        self, json_logs: JsonLogs
    ) -> None:
        sdk = FakeSdk({"primary": rate_limit(), "fallback": make_response()})

        result = await generate(GeminiClient("k", sdk_client=sdk))

        assert result.usage.is_fallback is True
        (event,) = json_logs.events("ai.gemini.attempt_failed")
        assert event.items() >= {
            "level": "warn", "model": "primary", "modelFallbackUsed": False,
            "errorCategory": "gemini_rate_limited", "geminiKind": "RATE_LIMIT_RPM",
            "willTryFallbackModel": True,
        }.items()  # fmt: skip
        assert isinstance(event["durationMs"], int)

    @pytest.mark.parametrize(
        ("error", "category", "kind"),
        [
            (rate_limit(), "gemini_rate_limited", "RATE_LIMIT_RPM"),
            (overloaded(), "gemini_unavailable", "HIGH_DEMAND_503"),
        ],
    )
    async def test_both_models_failing_logs_two_attempts_and_only_the_first_expects_a_fallback(
        self, json_logs: JsonLogs, error: Exception, category: str, kind: str
    ) -> None:
        sdk = FakeSdk({"primary": error, "fallback": error})

        with pytest.raises(LlmServiceError) as info:
            await generate(GeminiClient("k", sdk_client=sdk))

        assert info.value.code == "AI_UNAVAILABLE"
        events = json_logs.events("ai.gemini.attempt_failed")
        assert [(e["model"], e["willTryFallbackModel"]) for e in events] == [
            ("primary", True),
            ("fallback", False),
        ]
        assert {e["errorCategory"] for e in events} == {category}

    async def test_an_invalid_key_never_tries_the_backup_model(self, json_logs: JsonLogs) -> None:
        sdk = FakeSdk({"primary": auth_error(), "fallback": make_response()})
        with pytest.raises(LlmServiceError):
            await generate(GeminiClient("k", sdk_client=sdk))
        (event,) = json_logs.events("ai.gemini.attempt_failed")
        assert event["errorCategory"] == "gemini_auth" and event["willTryFallbackModel"] is False

    async def test_a_daily_quota_is_its_own_category_and_never_tries_the_backup(
        self, json_logs: JsonLogs
    ) -> None:
        sdk = FakeSdk({"primary": daily_quota(), "fallback": make_response()})
        with pytest.raises(LlmServiceError):
            await generate(GeminiClient("k", sdk_client=sdk))
        (event,) = json_logs.events("ai.gemini.attempt_failed")
        assert event["errorCategory"] == "gemini_quota_exhausted"
        assert event["willTryFallbackModel"] is False

    async def test_a_timeout_is_categorised(self, json_logs: JsonLogs) -> None:
        sdk = FakeSdk({"primary": TimeoutError("timed out"), "fallback": make_response()})
        with pytest.raises(LlmServiceError):
            await generate(GeminiClient("k", sdk_client=sdk))
        assert json_logs.events("ai.gemini.attempt_failed")[0]["errorCategory"] == "gemini_timeout"

    async def test_skipping_a_cooling_down_primary_is_logged_as_a_fallback(
        self, json_logs: JsonLogs
    ) -> None:
        cooldown = ModelCooldown()
        cooldown.record_failure("primary", 60)
        sdk = FakeSdk({"primary": make_response(), "fallback": make_response()})

        await generate(GeminiClient("k", sdk_client=sdk, cooldown=cooldown))

        assert sdk.calls == ["fallback"]
        (event,) = json_logs.events("ai.gemini.model_skipped")
        assert event.items() >= {"model": "primary", "reason": "cooldown", "level": "warn"}.items()
        assert 0 < event["cooldownRemainingSeconds"] <= 60

    async def test_provider_text_and_the_prompt_are_never_logged(self, json_logs: JsonLogs) -> None:
        hostile = rate_limit()
        hostile.message = f"SENTINEL_PROVIDER_TEXT {GOOGLE_KEY} Bearer {FAKE_JWT}"
        sdk = FakeSdk({"primary": hostile, "fallback": hostile})

        with pytest.raises(LlmServiceError):
            await generate(GeminiClient("k", sdk_client=sdk))

        assert json_logs.events("ai.gemini.attempt_failed")
        for forbidden in ("SENTINEL", GOOGLE_KEY, FAKE_JWT, "Bearer "):
            assert forbidden not in json_logs.text

    async def test_a_successful_first_attempt_logs_no_failure_events(
        self, json_logs: JsonLogs
    ) -> None:
        sdk = FakeSdk({"primary": make_response(), "fallback": make_response()})
        await generate(GeminiClient("k", sdk_client=sdk))
        assert json_logs.entries() == []
