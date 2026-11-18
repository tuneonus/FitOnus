"""GeminiClient with a fake SDK: no network. Covers fallback, cooldown, deadline and error mapping."""

import asyncio
from types import SimpleNamespace
from typing import Any

import pytest
from google.genai import errors as genai_errors

from onusfit_ai.core.errors import AiError
from onusfit_ai.llm.errors import ModelCooldown, classify_gemini_error
from onusfit_ai.llm.gemini import GeminiClient


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
        self.aio = SimpleNamespace(models=SimpleNamespace(generate_content=self._generate))

    async def _generate(self, *, model: str, contents: str, config: Any) -> Any:
        self.calls.append(model)
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
    with pytest.raises(AiError) as info:
        await run(GeminiClient("k", sdk_client=sdk))
    assert sdk.calls == ["primary", "fallback"]  # bounded: never more than two attempts
    assert (info.value.status_code, info.value.code, info.value.dispatched) == (
        503,
        "AI_UNAVAILABLE",
        True,
    )


async def test_auth_error_never_tries_fallback() -> None:
    sdk = FakeSdk({"primary": auth_error(), "fallback": make_response()})
    with pytest.raises(AiError) as info:
        await run(GeminiClient("k", sdk_client=sdk))
    assert sdk.calls == ["primary"]
    assert info.value.code == "PROVIDER_AUTH_ERROR"


async def test_project_wide_daily_quota_never_tries_fallback() -> None:
    sdk = FakeSdk({"primary": daily_quota(), "fallback": make_response()})
    with pytest.raises(AiError) as info:
        await run(GeminiClient("k", sdk_client=sdk))
    assert sdk.calls == ["primary"]
    assert (info.value.status_code, info.value.code) == (429, "PROVIDER_QUOTA_EXHAUSTED")


async def test_unknown_error_is_not_retried() -> None:
    sdk = FakeSdk({"primary": RuntimeError("boom"), "fallback": make_response()})
    with pytest.raises(AiError) as info:
        await run(GeminiClient("k", sdk_client=sdk))
    assert sdk.calls == ["primary"]
    assert info.value.code == "PROVIDER_ERROR"
    assert "boom" not in info.value.message  # provider/internal text never leaks


async def test_timeout_is_not_retried_and_maps_to_504() -> None:
    async def hang() -> Any:
        await asyncio.sleep(5)

    sdk = FakeSdk({"primary": hang, "fallback": make_response()})
    client = GeminiClient("k", sdk_client=sdk, attempt_timeout_s=0.05)
    with pytest.raises(AiError) as info:
        await run(client)
    assert sdk.calls == ["primary"]
    assert (info.value.status_code, info.value.code, info.value.dispatched) == (
        504,
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
    with pytest.raises(AiError) as info:
        await run(GeminiClient("k", sdk_client=sdk, cooldown=cooldown))
    assert sdk.calls == []
    assert (info.value.code, info.value.dispatched) == ("AI_UNAVAILABLE", False)


async def test_missing_api_key_fails_before_any_call() -> None:
    with pytest.raises(AiError) as info:
        await run(GeminiClient(None))
    assert (info.value.code, info.value.dispatched) == ("PROVIDER_NOT_CONFIGURED", False)


async def test_exhausted_deadline_does_not_start_a_fallback_attempt() -> None:
    now = [0.0]

    async def slow_fail() -> Any:
        now[0] += 9.5  # primary "takes" 9.5 s of a 10 s budget, then fails
        raise rate_limit()

    sdk = FakeSdk({"primary": slow_fail, "fallback": make_response()})
    with pytest.raises(AiError):
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
