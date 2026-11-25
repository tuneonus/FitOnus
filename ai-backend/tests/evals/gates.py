"""Automated regression gates, baseline comparison, and critical safety enforcement."""

import json
from pathlib import Path
from typing import Any

from tests.evals.schemas import RegressionGateReport, RegressionGateThresholds

CRITICAL_SAFETY_CATEGORIES = frozenset({"fitness_safety", "security_adversarial"})
CRITICAL_SAFETY_CLASSIFICATIONS = frozenset(
    {"safety_failure", "security_failure", "privacy_failure"}
)


def compute_category_breakdown(case_results: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Aggregate pass counts, rates, average scores, and failures per category."""
    buckets: dict[str, list[dict[str, Any]]] = {}
    for res in case_results:
        cat = str(res.get("category", "unknown"))
        buckets.setdefault(cat, []).append(res)

    summary: dict[str, dict[str, Any]] = {}
    for cat, items in sorted(buckets.items()):
        total = len(items)
        passed = sum(1 for i in items if i.get("passed"))
        avg_score = round(sum(float(i.get("score", 0.0)) for i in items) / max(1, total), 3)
        summary[cat] = {
            "total": total,
            "passed": passed,
            "failed": total - passed,
            "pass_rate": round(passed / max(1, total), 4),
            "average_score": avg_score,
        }
    return summary


def evaluate_regression_gate(
    report: dict[str, Any],
    *,
    baseline: dict[str, Any] | None = None,
    thresholds: RegressionGateThresholds | None = None,
) -> RegressionGateReport:
    """Validate report against critical safety mandates, SLO caps, and baseline expectations."""
    cfg = thresholds or RegressionGateThresholds()
    regressions: list[str] = []
    warnings: list[str] = []
    summary_delta: dict[str, float | int] = {}

    results = list(report.get("results", []))
    total = len(results)
    passed = sum(1 for r in results if r.get("passed"))
    overall_rate = passed / max(1, total) if total > 0 else 0.0
    avg_score = float(report.get("summary", {}).get("average_score", 0.0))

    if total == 0:
        regressions.append("Evaluation executed 0 benchmark cases")

    if overall_rate < cfg.min_overall_pass_rate:
        regressions.append(
            f"Overall pass rate {overall_rate:.4f} below gate threshold {cfg.min_overall_pass_rate:.4f}"
        )

    # 1. Zero-tolerance critical safety & security gate
    safety_cases = [
        r
        for r in results
        if r.get("category") in CRITICAL_SAFETY_CATEGORIES
        or r.get("failure_classification") in CRITICAL_SAFETY_CLASSIFICATIONS
    ]
    safety_failed = [r.get("case_id", "unknown") for r in safety_cases if not r.get("passed")]
    critical_safety_failed = len(safety_failed) > 0
    if safety_cases:
        safety_rate = (len(safety_cases) - len(safety_failed)) / len(safety_cases)
        if safety_rate < cfg.min_safety_pass_rate:
            regressions.append(
                f"Critical safety/security gate failed ({safety_rate:.4f} < {cfg.min_safety_pass_rate:.4f}): cases={safety_failed}"
            )
    elif critical_safety_failed:
        regressions.append(f"Critical safety/security classification failed: {safety_failed}")

    # 2. Performance SLO thresholds check
    perf_summary = report.get("performance_summary", {})
    p95 = float(perf_summary.get("p95_latency_ms", 0.0) or 0.0)
    avg_tok = float(perf_summary.get("avg_tokens_per_case", 0.0) or 0.0)
    total_cost = float(perf_summary.get("total_estimated_cost_usd", 0.0) or 0.0)
    if p95 > cfg.max_p95_latency_ms:
        regressions.append(f"p95 latency {p95}ms exceeded gate {cfg.max_p95_latency_ms}ms")
    if avg_tok > cfg.max_avg_tokens_per_case:
        regressions.append(
            f"Average tokens/case {avg_tok} exceeded gate {cfg.max_avg_tokens_per_case}"
        )
    if total_cost > cfg.max_total_estimated_cost_usd:
        regressions.append(
            f"Total estimated cost ${total_cost:.4f} exceeded gate ${cfg.max_total_estimated_cost_usd:.4f}"
        )

    # 3. Baseline comparison if baseline JSON supplied
    baseline_compared = baseline is not None
    if baseline is not None:
        base_summary = baseline.get("summary", {})
        base_total = int(base_summary.get("total_cases", 0))
        base_score = float(base_summary.get("average_score", 0.0))
        base_passed_ids = {str(cid) for cid in baseline.get("passed_case_ids", [])}

        summary_delta["total_cases_delta"] = total - base_total
        summary_delta["average_score_delta"] = round(avg_score - base_score, 4)

        if base_total - total > cfg.max_case_count_drop:
            regressions.append(
                f"Benchmark case count shrank vs baseline: {total} < {base_total} (allowed drop {cfg.max_case_count_drop})"
            )

        if base_score - avg_score > cfg.max_score_drop:
            regressions.append(
                f"Average score regressed vs baseline: {avg_score} < {base_score} (drop > {cfg.max_score_drop})"
            )

        current_failed_ids = {str(r["case_id"]) for r in results if not r.get("passed")}
        newly_failing = sorted(base_passed_ids & current_failed_ids)
        if newly_failing:
            regressions.append(f"Previously passing cases regressed: {newly_failing[:10]}")

        base_cats = baseline.get("category_breakdown", {})
        cur_cats = compute_category_breakdown(results)
        for cat, base_cat in base_cats.items():
            if cat not in cur_cats:
                regressions.append(f"Baseline category missing from current run: '{cat}'")
                continue
            cur_rate = float(cur_cats[cat]["pass_rate"])
            base_rate = float(base_cat.get("pass_rate", 1.0))
            if cur_rate < base_rate:
                regressions.append(
                    f"Category '{cat}' pass rate dropped: {cur_rate:.4f} < {base_rate:.4f}"
                )

    return RegressionGateReport(
        passed=len(regressions) == 0,
        critical_safety_failed=critical_safety_failed,
        regressions=regressions,
        warnings=warnings,
        baseline_compared=baseline_compared,
        summary_delta=summary_delta,
    )


def load_baseline_file(path: Path) -> dict[str, Any]:
    """Read a JSON regression baseline artifact from disk."""
    with open(path, encoding="utf-8") as f:
        return dict(json.load(f))
