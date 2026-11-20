"""Classifies Gemini failures and keeps a per-model cooldown ("circuit breaker").

Ported from the Node implementation so both backends make the same decisions:
  backend/src/shared/ai/ai-error-classifier.ts   (kinds, retryable / project-wide rules)
  backend/src/shared/ai/model-cooldown-tracker.ts (min 5 s, max 24 h cooldown)

One deliberate difference: Node also looks for bare "401"/"403"/"404" inside error text. Here the
numeric HTTP code from the SDK exception is used instead, which avoids matching unrelated numbers.
"""

import re
import time
from dataclasses import dataclass
from typing import Any, Literal

import httpx

ErrorKind = Literal[
    "AUTH_ERROR",
    "MODEL_NOT_FOUND",
    "TIMEOUT",
    "QUOTA_EXHAUSTED_RPD",
    "RATE_LIMIT_RPM",
    "HIGH_DEMAND_503",
    "BAD_REQUEST",
    "UNKNOWN",
]


@dataclass(frozen=True)
class ClassifiedError:
    kind: ErrorKind
    # May the same request be tried once on the fallback model?
    is_retryable: bool
    # Does the failure affect the whole Google project (so a different model cannot help)?
    is_project_wide: bool
    retry_after_seconds: int


def _details(exc: BaseException) -> list[dict[str, Any]]:
    details = getattr(exc, "details", None)
    if isinstance(details, dict):  # SDK sometimes keeps the whole {"error": {...}} body
        details = details.get("error", {}).get("details")
    return [d for d in details if isinstance(d, dict)] if isinstance(details, list) else []


def _extract_retry_seconds(text: str, details: list[dict[str, Any]]) -> int:
    for detail in details:
        delay = detail.get("retryDelay")
        if delay:
            match = re.fullmatch(r"(\d+)s?", str(delay))
            if match:
                return int(match.group(1))
    match = re.search(r"retry (?:in|after) (\d+)s", text, re.IGNORECASE)
    if match:
        return int(match.group(1))
    match = re.search(r"retry in (?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?", text, re.IGNORECASE)
    if match and any(match.groups()):
        hours, minutes, seconds = (int(g or 0) for g in match.groups())
        return hours * 3600 + minutes * 60 + seconds
    return 0


def _is_model_specific_quota(details: list[dict[str, Any]]) -> bool:
    for detail in details:
        for violation in detail.get("violations", []) or []:
            if isinstance(violation, dict) and (violation.get("quotaDimensions") or {}).get(
                "model"
            ):
                return True
    return False


def classify_gemini_error(exc: BaseException) -> ClassifiedError:
    text = str(exc)
    code = getattr(exc, "code", None)
    status = str(getattr(exc, "status", "") or "")
    details = _details(exc)

    if code in (401, 403) or "API_KEY_INVALID" in text or "API key not valid" in text:
        return ClassifiedError("AUTH_ERROR", False, True, 0)

    if code == 404 or status == "NOT_FOUND" or "no longer available" in text:
        return ClassifiedError("MODEL_NOT_FOUND", True, False, 0)  # worth trying the fallback model

    if (
        isinstance(exc, (TimeoutError, httpx.TimeoutException))
        or "timed out" in text
        or "DEADLINE_EXCEEDED" in text
    ):
        return ClassifiedError("TIMEOUT", False, False, 5)

    # HTTP 400 and friends: Gemini refused THIS request (media it cannot read, a bad argument).
    # That says nothing about the model's health, so the caller must not cool the model down.
    if code in (400, 422) or status in ("INVALID_ARGUMENT", "FAILED_PRECONDITION", "OUT_OF_RANGE"):
        return ClassifiedError("BAD_REQUEST", False, False, 0)

    retry_seconds = _extract_retry_seconds(text, details)
    model_specific = _is_model_specific_quota(details)

    if code == 429 or status == "RESOURCE_EXHAUSTED" or "RESOURCE_EXHAUSTED" in text:
        is_daily = (
            "requests per day" in text
            or "per day limit exceeded" in text
            or "GenerateRequestsPerDay" in text
            or "free_tier_requests" in text
            or retry_seconds > 600  # a wait of more than 10 minutes means a daily quota
        )
        if is_daily:
            return ClassifiedError(
                "QUOTA_EXHAUSTED_RPD",
                is_retryable=model_specific,  # another model may still have quota
                is_project_wide=not model_specific,
                retry_after_seconds=retry_seconds or 86400,
            )
        return ClassifiedError("RATE_LIMIT_RPM", True, False, retry_seconds or 25)

    if (
        code in (500, 503)
        or status == "UNAVAILABLE"
        or "overloaded" in text
        or "high demand" in text
    ):
        return ClassifiedError("HIGH_DEMAND_503", True, False, retry_seconds or 15)

    return ClassifiedError("UNKNOWN", False, False, 5)


class ModelCooldown:
    """After a model fails, skip it for a while instead of making calls that will fail again."""

    def __init__(self, clock: Any = time.monotonic) -> None:
        self._clock = clock
        self._until: dict[str, float] = {}

    def is_available(self, model: str) -> bool:
        until = self._until.get(model)
        if until is None:
            return True
        if self._clock() >= until:
            del self._until[model]  # cooldown expired: allow a trial request
            return True
        return False

    def remaining_seconds(self, model: str) -> int:
        until = self._until.get(model)
        if until is None:
            return 0
        return max(0, int(until - self._clock() + 0.999))

    def record_failure(self, model: str, cooldown_seconds: int) -> None:
        seconds = max(5, min(86400, cooldown_seconds))
        self._until[model] = self._clock() + seconds

    def record_success(self, model: str) -> None:
        self._until.pop(model, None)


class LlmServiceError(Exception):
    """Raised by LLM adapters when generation fails.

    Pure infrastructure/adapter exception containing no HTTP status codes or web framework types.
    """

    def __init__(
        self,
        *,
        code: str,
        message: str,
        retry_after_seconds: int | None = None,
        dispatched: bool = False,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retry_after_seconds = retry_after_seconds
        self.dispatched = dispatched

