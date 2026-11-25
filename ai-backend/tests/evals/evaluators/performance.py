"""Performance, Token Cost, Streaming TTFT, and Cancellation Evaluation Engine.

Reuses FitOnus pricing parity (`onusfit_ai.shared.logging.metrics.estimate_cost_usd`)
for deterministic cost verification across non-streaming and SSE streaming fixtures.
"""

import math
from typing import Any

from tests.evals.schemas import EvaluationMetricResult, PerformanceEvalMetrics

from onusfit_ai.shared.logging.metrics import estimate_cost_usd


def compute_percentile(values: list[float], pct: float) -> float:
    """Deterministic linear-interpolated percentile helper."""
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return round(ordered[0], 2)
    pos = (pct / 100.0) * (len(ordered) - 1)
    lo = math.floor(pos)
    hi = math.ceil(pos)
    if lo == hi:
        return round(ordered[lo], 2)
    return round(ordered[lo] * (1.0 - (pos - lo)) + ordered[hi] * (pos - lo), 2)


def summarize_performance_results(case_results: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate p50/p95/p99 latency, TTFT, tokens, cost, and cancellation stats."""
    latencies: list[float] = []
    ttfts: list[float] = []
    total_tokens = 0
    total_cost = 0.0
    cancelled_cases = 0
    clean_cancellations = 0

    for item in case_results:
        perf = item.get("performance") or {}
        lat = perf.get("latency_ms")
        if isinstance(lat, (int, float)) and lat >= 0:
            latencies.append(float(lat))
        elif isinstance(item.get("duration_ms"), (int, float)):
            latencies.append(float(item["duration_ms"]))

        ttft = perf.get("ttft_ms")
        if isinstance(ttft, (int, float)) and ttft >= 0:
            ttfts.append(float(ttft))

        tok_val = perf.get("total_tokens", item.get("token_usage", {}).get("total_tokens", 0))
        if isinstance(tok_val, int) and tok_val >= 0:
            total_tokens += tok_val

        cost_val = perf.get("estimated_cost_usd", 0.0)
        if isinstance(cost_val, (int, float)) and cost_val >= 0:
            total_cost += float(cost_val)

        if "cancelled_cleanly" in perf and item.get("expected_outcome") == "cancelled":
            cancelled_cases += 1
            if perf["cancelled_cleanly"]:
                clean_cancellations += 1

    count = max(1, len(case_results))
    return {
        "cases_with_latency": len(latencies),
        "p50_latency_ms": compute_percentile(latencies, 50.0),
        "p95_latency_ms": compute_percentile(latencies, 95.0),
        "p99_latency_ms": compute_percentile(latencies, 99.0),
        "ttft_p50_ms": compute_percentile(ttfts, 50.0) if ttfts else None,
        "ttft_p95_ms": compute_percentile(ttfts, 95.0) if ttfts else None,
        "total_tokens": total_tokens,
        "avg_tokens_per_case": round(total_tokens / count, 2),
        "total_estimated_cost_usd": round(total_cost, 6),
        "cancelled_cases": cancelled_cases,
        "clean_cancellation_rate": (
            round(clean_cancellations / cancelled_cases, 4) if cancelled_cases else 1.0
        ),
    }


class PerformanceEvaluator:
    """Evaluates latency, token budgets, estimated USD cost parity, streaming TTFT, and cancellation."""

    def evaluate(
        self,
        *,
        candidate: dict[str, Any],
        input_payload: dict[str, Any],
        expected_outcome: str = "ok",
    ) -> EvaluationMetricResult:
        reasons: list[str] = []
        checks = 0
        passed_checks = 0

        model = str(candidate.get("model", input_payload.get("model", "gemini-2.5-flash-lite")))
        duration_ms = float(candidate.get("duration_ms", 0.0))
        ttft_ms_raw = candidate.get("ttft_ms")
        ttft_ms = float(ttft_ms_raw) if ttft_ms_raw is not None else None
        in_tok = int(candidate.get("input_tokens", 0))
        out_tok = int(candidate.get("output_tokens", 0))
        cached_tok = int(candidate.get("cached_tokens", 0))
        total_tok = int(candidate.get("total_tokens", in_tok + out_tok))
        chunks = int(candidate.get("chunks_emitted", 0))

        expected_cost = estimate_cost_usd(model, in_tok, out_tok, cached_tok)
        reported_cost = candidate.get("estimated_cost_usd")

        # 1. Cost parity check if reported_cost provided
        if reported_cost is not None:
            checks += 1
            if abs(float(reported_cost) - expected_cost) <= 1e-6:
                passed_checks += 1
            else:
                reasons.append(
                    f"Cost calculation mismatch: reported {reported_cost}, expected {expected_cost}"
                )

        # 2. Cost cap check
        max_cost = input_payload.get("max_cost_usd")
        if max_cost is not None:
            checks += 1
            if expected_cost <= float(max_cost):
                passed_checks += 1
            else:
                reasons.append(f"Estimated cost ${expected_cost:.6f} exceeded cap ${max_cost}")

        # 3. End-to-end latency ceiling
        max_latency_ms = input_payload.get("max_latency_ms")
        if max_latency_ms is not None:
            checks += 1
            if duration_ms <= float(max_latency_ms):
                passed_checks += 1
            else:
                reasons.append(f"Latency {duration_ms}ms exceeded budget {max_latency_ms}ms")

        # 4. Token budget cap
        max_tokens = input_payload.get("max_total_tokens")
        if max_tokens is not None:
            checks += 1
            if total_tok <= int(max_tokens):
                passed_checks += 1
            else:
                reasons.append(f"Token usage {total_tok} exceeded cap {max_tokens}")

        # 5. Streaming TTFT and chunk cadence
        max_ttft = input_payload.get("max_ttft_ms")
        if max_ttft is not None:
            checks += 1
            if ttft_ms is not None and ttft_ms <= float(max_ttft):
                passed_checks += 1
            else:
                reasons.append(f"Streaming TTFT {ttft_ms}ms failed budget <= {max_ttft}ms")

        min_chunks = input_payload.get("min_chunks")
        if min_chunks is not None:
            checks += 1
            if chunks >= int(min_chunks):
                passed_checks += 1
            else:
                reasons.append(f"Streaming chunk count {chunks} < expected minimum {min_chunks}")

        # 6. Cancellation / timeout clean termination
        cancelled_cleanly = True
        if expected_outcome == "cancelled":
            checks += 1
            actual_outcome = str(candidate.get("outcome", ""))
            post_cancel_chunks = int(candidate.get("post_cancel_chunks", 0))
            cancel_delay = float(candidate.get("cancellation_latency_ms", duration_ms))
            max_cancel_ms = float(input_payload.get("max_cancellation_latency_ms", 500.0))
            if (
                actual_outcome != "cancelled"
                or post_cancel_chunks > 0
                or cancel_delay > max_cancel_ms
            ):
                cancelled_cleanly = False
                reasons.append(
                    f"Unclean stream cancellation: outcome={actual_outcome}, "
                    f"post_cancel_chunks={post_cancel_chunks}, delay={cancel_delay}ms"
                )
            else:
                passed_checks += 1

        perf_metrics = PerformanceEvalMetrics(
            latency_ms=duration_ms,
            ttft_ms=ttft_ms,
            input_tokens=in_tok,
            output_tokens=out_tok,
            cached_tokens=cached_tok,
            total_tokens=total_tok,
            estimated_cost_usd=expected_cost,
            chunks_emitted=chunks,
            cancelled_cleanly=cancelled_cleanly,
        )

        passed = len(reasons) == 0
        score = round(passed_checks / max(1, checks), 3)
        if not passed:
            score = min(score, round(max(0.0, 1.0 - 0.2 * len(reasons)), 3))

        return EvaluationMetricResult(
            metric_name="performance_evaluation",
            passed=passed,
            score=score,
            details={"performance": perf_metrics.model_dump()},
            failure_reasons=reasons,
            failure_classification="none" if passed else "performance_failure",
        )
