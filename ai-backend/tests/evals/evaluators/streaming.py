"""Offline evaluator for Phase 14 Streaming AI (SSE) quality, safety, cancellation, and fallback."""

from typing import Any

from tests.evals.schemas import EvaluationMetricResult, ExpectedToolCall


class StreamingEvaluator:
    """Evaluates SSE streaming chunk integrity, safe status progress, sanitization, and recovery."""

    def evaluate(
        self,
        candidate: dict[str, Any],
        *,
        expected_tools: list[ExpectedToolCall] | None = None,
        expected_outcome: str = "ok",
        expected_safety_disclaimers: list[str] | None = None,
        forbidden_terms: list[str] | None = None,
        input_payload: dict[str, Any] | None = None,
    ) -> EvaluationMetricResult:
        reasons: list[str] = []
        checks = 0
        passed_checks = 0

        expected_tools = expected_tools or []
        expected_safety_disclaimers = expected_safety_disclaimers or []
        forbidden_terms = forbidden_terms or []
        input_payload = input_payload or {}

        checks += 1
        actual_outcome = str(candidate.get("outcome", "ok"))
        if actual_outcome == expected_outcome:
            passed_checks += 1
        else:
            reasons.append(
                f"Outcome mismatch: expected '{expected_outcome}', got '{actual_outcome}'"
            )

        checks += 1
        secrets_leaked = bool(candidate.get("secrets_leaked", False))
        error_sanitized = bool(candidate.get("error_sanitized", True))
        if not secrets_leaked and error_sanitized:
            passed_checks += 1
        else:
            reasons.append("Privacy/error sanitization invariant violated")

        checks += 1
        cancelled_cleanly = bool(candidate.get("cancelled_cleanly", True))
        if cancelled_cleanly:
            passed_checks += 1
        else:
            reasons.append("Stream cancellation/shutdown was not clean")

        text = str(candidate.get("text", ""))
        chunks = candidate.get("chunks", [])
        if isinstance(chunks, list) and actual_outcome == "ok" and chunks:
            checks += 1
            joined = "".join(str(c) for c in chunks)
            if joined == text:
                passed_checks += 1
            else:
                reasons.append("Streamed chunks do not reconstruct final response text accurately")

        status_messages = candidate.get("status_messages", [])
        combined_surface = " ".join(
            [
                text,
                " ".join(str(s) for s in status_messages)
                if isinstance(status_messages, list)
                else "",
                str(candidate.get("error_message", "")),
            ]
        )
        for term in forbidden_terms:
            checks += 1
            if term.lower() not in combined_surface.lower():
                passed_checks += 1
            else:
                reasons.append(f"Forbidden term leaked in stream surface: {term!r}")

        for disclaimer in expected_safety_disclaimers:
            checks += 1
            if disclaimer.lower() in text.lower():
                passed_checks += 1
            else:
                reasons.append(f"Missing expected safety disclaimer term: {disclaimer!r}")

        if expected_tools:
            actual_tools = set(candidate.get("tool_calls", []) or [])
            for tool in expected_tools:
                checks += 1
                if tool.tool_name in actual_tools:
                    passed_checks += 1
                else:
                    reasons.append(f"Missing expected tool attribution: {tool.tool_name}")

        max_ttft_ms = input_payload.get("max_ttft_ms")
        ttft_ms = candidate.get("ttft_ms")
        if isinstance(max_ttft_ms, int | float):
            checks += 1
            if isinstance(ttft_ms, int | float) and float(ttft_ms) <= float(max_ttft_ms):
                passed_checks += 1
            else:
                reasons.append(f"TTFT {ttft_ms}ms exceeded budget {max_ttft_ms}ms")

        score = round(passed_checks / max(1, checks), 4)
        return EvaluationMetricResult(
            metric_name="streaming_ai",
            passed=len(reasons) == 0,
            score=score,
            details={"checks": checks, "passed_checks": passed_checks},
            failure_reasons=reasons,
        )
