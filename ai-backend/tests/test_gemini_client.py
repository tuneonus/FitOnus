"""GeminiClient with a fake SDK: no network. Covers fallback, cooldown, deadline and error mapping."""

import asyncio
from types import SimpleNamespace
from typing import Any

import pytest
from google.genai import errors as genai_errors

from onusfit_ai.shared.llm.errors import (
    LlmServiceError,
    ModelCooldown,
    classify_gemini_error,
)
from onusfit_ai.shared.llm.gemini import GeminiClient
from onusfit_ai.shared.llm.ports import MediaInput


def make_response(text: str = "hi") -> Any:
    meta = SimpleNamespace(
        prompt_token_count=10,
        candidates_token_count=4,
        cached_content_token_count=2,
        thoughts_token_count=3,
        total_token_count=17,
    )
    return SimpleNamespace(text=f"  {text}  ", usage_metadata=meta)


class FakeSdk:
    """Mimics `client.aio.models.generate_content`. `plan` maps model -> result or exception."""

    def __init__(self, plan: dict[str, Any]) -> None:
        self.plan = plan
        self.calls: list[str] = []
        self.contents: list[Any] = []
        self.aio = SimpleNamespace(models=SimpleNamespace(generate_content=self._generate))

    async def _generate(self, *, model: str, contents: str, config: Any) -> Any:
        self.calls.append(model)
        self.contents.append(contents)
        outcome = self.plan[model]
        if isinstance(outcome, BaseException):
            raise outcome
        if callable(outcome):
            return await outcome()
        return outcome


def rate_limit() -> genai_errors.ClientError:
    return genai_errors.ClientError(
        429, {"error": {"code": 429, "message": "slow", "status": "RESOURCE_EXHAUSTED"}}
    )


def overloaded() -> genai_errors.ServerError:
    return genai_errors.ServerError(
        503, {"error": {"code": 503, "message": "busy", "status": "UNAVAILABLE"}}
    )


def auth_error() -> genai_errors.ClientError:
    return genai_errors.ClientError(
        403, {"error": {"code": 403, "message": "API key not valid", "status": "PERMISSION_DENIED"}}
    )


def bad_request() -> genai_errors.ClientError:
    return genai_errors.ClientError(
        400,
        {
            "error": {
                "code": 400,
                "message": "Unable to process input audio",
                "status": "INVALID_ARGUMENT",
            }
        },
    )


def daily_quota() -> genai_errors.ClientError:
    return genai_errors.ClientError(
        429,
        {
            "error": {
                "code": 429,
                "status": "RESOURCE_EXHAUSTED",
                "message": "Quota exceeded for GenerateRequestsPerDay",
            }
        },
    )


async def run(client: GeminiClient, **kw: Any):  # type: ignore[no-untyped-def]
    return await client.generate_text(
        "prompt",
        primary_model="primary",
        fallback_model="fallback",
        deadline_s=kw.pop("deadline_s", 10),
        **kw,
    )


async def test_success_on_primary_returns_text_and_usage() -> None:
    sdk = FakeSdk({"primary": make_response("hello")})
    result = await run(GeminiClient("k", sdk_client=sdk))
    assert result.text == "hello"  # trimmed
    assert sdk.calls == ["primary"]
    u = result.usage
    assert (u.model, u.is_fallback, u.input_tokens, u.output_tokens) == ("primary", False, 10, 4)
    assert (u.cached_tokens, u.thinking_tokens, u.total_tokens) == (2, 3, 17)


async def test_rate_limit_on_primary_uses_fallback_once() -> None:
    sdk = FakeSdk({"primary": rate_limit(), "fallback": make_response("from fallback")})
    result = await run(GeminiClient("k", sdk_client=sdk))
    assert sdk.calls == ["primary", "fallback"]
    assert result.usage.is_fallback and result.usage.model == "fallback"


async def test_overload_on_primary_uses_fallback() -> None:
    sdk = FakeSdk({"primary": overloaded(), "fallback": make_response()})
    result = await run(GeminiClient("k", sdk_client=sdk))
    assert result.usage.is_fallback


async def test_both_models_failing_gives_ai_unavailable_after_exactly_two_calls() -> None:
    sdk = FakeSdk({"primary": rate_limit(), "fallback": overloaded()})
    with pytest.raises(LlmServiceError) as info:
        await run(GeminiClient("k", sdk_client=sdk))
    assert sdk.calls == ["primary", "fallback"]  # bounded: never more than two attempts
    assert (info.value.code, info.value.dispatched) == (
        "AI_UNAVAILABLE",
        True,
    )


async def test_auth_error_never_tries_fallback() -> None:
    sdk = FakeSdk({"primary": auth_error(), "fallback": make_response()})
    with pytest.raises(LlmServiceError) as info:
        await run(GeminiClient("k", sdk_client=sdk))
    assert sdk.calls == ["primary"]
    assert info.value.code == "PROVIDER_AUTH_ERROR"


async def test_project_wide_daily_quota_never_tries_fallback() -> None:
    sdk = FakeSdk({"primary": daily_quota(), "fallback": make_response()})
    with pytest.raises(LlmServiceError) as info:
        await run(GeminiClient("k", sdk_client=sdk))
    assert sdk.calls == ["primary"]
    assert info.value.code == "PROVIDER_QUOTA_EXHAUSTED"


async def test_unknown_error_is_not_retried() -> None:
    sdk = FakeSdk({"primary": RuntimeError("boom"), "fallback": make_response()})
    with pytest.raises(LlmServiceError) as info:
        await run(GeminiClient("k", sdk_client=sdk))
    assert sdk.calls == ["primary"]
    assert info.value.code == "PROVIDER_ERROR"
    assert "boom" not in info.value.message  # provider/internal text never leaks


async def test_timeout_is_not_retried_and_maps_to_504() -> None:
    async def hang() -> Any:
        await asyncio.sleep(5)

    sdk = FakeSdk({"primary": hang, "fallback": make_response()})
    client = GeminiClient("k", sdk_client=sdk, attempt_timeout_s=0.05)
    with pytest.raises(LlmServiceError) as info:
        await run(client)
    assert sdk.calls == ["primary"]
    assert (info.value.code, info.value.dispatched) == (
        "PROVIDER_TIMEOUT",
        True,
    )


async def test_failed_primary_is_skipped_while_cooling_down() -> None:
    now = [1000.0]
    cooldown = ModelCooldown(clock=lambda: now[0])
    sdk = FakeSdk({"primary": rate_limit(), "fallback": make_response()})
    client = GeminiClient("k", sdk_client=sdk, cooldown=cooldown, clock=lambda: now[0])
    await run(client)  # primary fails -> cooldown, fallback answers
    sdk.calls.clear()
    await run(client)  # primary is skipped straight away
    assert sdk.calls == ["fallback"]
    now[0] += 3600  # cooldown expires
    sdk.plan["primary"] = make_response("recovered")
    sdk.calls.clear()
    result = await run(client)
    assert sdk.calls == ["primary"] and result.text == "recovered"


async def test_both_models_cooling_fails_fast_without_calling_gemini() -> None:
    cooldown = ModelCooldown()
    cooldown.record_failure("primary", 60)
    cooldown.record_failure("fallback", 60)
    sdk = FakeSdk({"primary": make_response(), "fallback": make_response()})
    with pytest.raises(LlmServiceError) as info:
        await run(GeminiClient("k", sdk_client=sdk, cooldown=cooldown))
    assert sdk.calls == []
    assert (info.value.code, info.value.dispatched) == ("AI_UNAVAILABLE", False)


async def test_missing_api_key_fails_before_any_call() -> None:
    with pytest.raises(LlmServiceError) as info:
        await run(GeminiClient(None))
    assert (info.value.code, info.value.dispatched) == ("PROVIDER_NOT_CONFIGURED", False)


async def test_exhausted_deadline_does_not_start_a_fallback_attempt() -> None:
    now = [0.0]

    async def slow_fail() -> Any:
        now[0] += 9.5  # primary "takes" 9.5 s of a 10 s budget, then fails
        raise rate_limit()

    sdk = FakeSdk({"primary": slow_fail, "fallback": make_response()})
    with pytest.raises(LlmServiceError):
        await run(GeminiClient("k", sdk_client=sdk, clock=lambda: now[0]), deadline_s=10)
    assert sdk.calls == ["primary"]  # under 1 s left: no second attempt


def test_classifier_reads_retry_delay_and_model_specific_quota() -> None:
    exc = genai_errors.ClientError(
        429,
        {
            "error": {
                "code": 429,
                "status": "RESOURCE_EXHAUSTED",
                "message": "x",
                "details": [
                    {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "42s"}
                ],
            }
        },
    )
    c = classify_gemini_error(exc)
    assert (c.kind, c.retry_after_seconds, c.is_retryable) == ("RATE_LIMIT_RPM", 42, True)

    model_daily = genai_errors.ClientError(
        429,
        {
            "error": {
                "code": 429,
                "status": "RESOURCE_EXHAUSTED",
                "message": "Quota exceeded for GenerateRequestsPerDay",
                "details": [
                    {
                        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
                        "violations": [{"quotaDimensions": {"model": "primary"}}],
                    }
                ],
            }
        },
    )
    c = classify_gemini_error(model_daily)
    assert c.kind == "QUOTA_EXHAUSTED_RPD" and c.is_retryable and not c.is_project_wide


async def test_text_only_call_sends_just_the_prompt() -> None:
    sdk = FakeSdk({"primary": make_response()})
    await run(GeminiClient("k", sdk_client=sdk))
    assert sdk.contents == ["prompt"]


async def test_audio_is_sent_before_the_prompt_like_the_node_client_did() -> None:
    sdk = FakeSdk({"primary": make_response()})
    media = MediaInput(mime_type="audio/m4a", data=b"\x00\x01clip")

    await run(GeminiClient("k", sdk_client=sdk), media=media)

    clip, prompt = sdk.contents[0]
    assert prompt == "prompt"
    assert clip.inline_data.mime_type == "audio/m4a"
    assert clip.inline_data.data == b"\x00\x01clip"


async def test_audio_is_also_sent_to_the_fallback_model() -> None:
    sdk = FakeSdk({"primary": rate_limit(), "fallback": make_response()})
    await run(GeminiClient("k", sdk_client=sdk), media=MediaInput("audio/webm", b"x"))
    assert sdk.calls == ["primary", "fallback"]
    assert all(isinstance(c, list) and len(c) == 2 for c in sdk.contents)


def test_http_400_is_classified_as_a_bad_request_that_no_other_model_can_fix() -> None:
    classified = classify_gemini_error(bad_request())
    assert classified.kind == "BAD_REQUEST"
    assert not classified.is_retryable and not classified.is_project_wide


async def test_a_bad_request_does_not_put_the_model_in_cooldown() -> None:
    # Regression (audit M1): one user's unreadable upload used to start a shared 5 s cooldown, so the
    # next user's valid request was refused with AI_UNAVAILABLE without Gemini even being called.
    sdk = FakeSdk({"primary": bad_request()})
    client = GeminiClient("k", sdk_client=sdk)
    call: dict[str, Any] = {"primary_model": "primary", "fallback_model": None, "deadline_s": 10}

    with pytest.raises(LlmServiceError) as first:
        await client.generate_text("prompt", **call)
    # Same wire error as before the fix (Gemini was called, so it may have been billed).
    assert (first.value.code, first.value.dispatched) == (
        "PROVIDER_ERROR",
        True,
    )

    sdk.plan["primary"] = make_response("fine")  # the next user's request is valid
    result = await client.generate_text("prompt", **call)
    assert result.text == "fine"
    assert sdk.calls == ["primary", "primary"]


async def test_failures_about_the_model_itself_still_start_a_cooldown() -> None:
    # The carve-out above is narrow: a generic failure is still treated as "the model is unhealthy".
    sdk = FakeSdk({"primary": RuntimeError("boom")})
    client = GeminiClient("k", sdk_client=sdk)
    call: dict[str, Any] = {"primary_model": "primary", "fallback_model": None, "deadline_s": 10}

    with pytest.raises(LlmServiceError):
        await client.generate_text("prompt", **call)
    with pytest.raises(LlmServiceError) as second:
        await client.generate_text("prompt", **call)
    assert second.value.code == "AI_UNAVAILABLE" and second.value.dispatched is False
    assert sdk.calls == ["primary"]  # the second request never reached Gemini
