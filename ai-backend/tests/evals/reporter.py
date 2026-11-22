"""Reporting utility for OnusFit AI Evaluations.

Generates:
1. Machine-readable JSON summary report
2. Human-readable Markdown summary report
"""

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def generate_json_report(
    eval_mode: str,
    case_results: list[dict[str, Any]],
    output_path: Path | None = None,
) -> dict[str, Any]:
    """Compile structured JSON evaluation report."""
    total_cases = len(case_results)
    passed_cases = sum(1 for c in case_results if c.get("passed", False))
    pass_rate = passed_cases / max(total_cases, 1)

    avg_score = (
        sum(c.get("score", 0.0) for c in case_results) / max(total_cases, 1)
        if total_cases > 0
        else 0.0
    )
    total_tokens = sum(c.get("token_usage", {}).get("total_tokens", 0) for c in case_results)
    avg_duration_ms = (
        sum(c.get("duration_ms", 0.0) for c in case_results) / max(total_cases, 1)
        if total_cases > 0
        else 0.0
    )

    report = {
        "timestamp": datetime.now(UTC).isoformat(),
        "mode": eval_mode,
        "is_live_evaluation": (eval_mode == "live"),
        "live_baseline_status": "MEASURED" if eval_mode == "live" else "NOT MEASURED",
        "summary": {
            "total_cases": total_cases,
            "passed_cases": passed_cases,
            "failed_cases": total_cases - passed_cases,
            "pass_rate_pct": round(pass_rate * 100, 2),
            "average_score": round(avg_score, 3),
            "avg_duration_ms": round(avg_duration_ms, 2),
            "total_tokens": total_tokens,
        },
        "results": case_results,
    }

    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)

    return report


def generate_markdown_report(
    report_dict: dict[str, Any],
    output_path: Path | None = None,
) -> str:
    """Compile human-readable Markdown summary report."""
    summary = report_dict["summary"]
    mode = report_dict["mode"].upper()
    is_live = report_dict["is_live_evaluation"]
    baseline_status = report_dict["live_baseline_status"]
    timestamp = report_dict["timestamp"]

    md = [
        "# OnusFit AI Evaluation & Benchmark Report",
        "",
        f"- **Execution Mode:** `{mode}`",
        f"- **Timestamp (UTC):** `{timestamp}`",
        f"- **Live Model Baseline Status:** **`{baseline_status}`**",
        "",
        "> [!IMPORTANT]",
    ]

    if not is_live:
        md.extend(
            [
                "> **Offline Regression Mode:** These results evaluate contract compliance, schema validity,",
                "> parser bounds, anti-confused-deputy isolation, and baseline keyword safety rules.",
                "> They DO NOT measure empirical generative model accuracy on live prompts.",
                "> `LIVE BASELINE: NOT MEASURED`",
            ]
        )
    else:
        md.extend(
            [
                "> **Live Model Benchmark:** These results reflect empirical Gemini generation quality,",
                "> tool selection accuracy, latency, and groundedness on live API calls.",
            ]
        )

    md.extend(
        [
            "",
            "## Overall Summary",
            "",
            "| Metric | Value |",
            "| :--- | :--- |",
            f"| **Total Cases Evaluated** | {summary['total_cases']} |",
            f"| **Passed Cases** | {summary['passed_cases']} |",
            f"| **Failed Cases** | {summary['failed_cases']} |",
            f"| **Pass Rate** | {summary['pass_rate_pct']}% |",
            f"| **Average Score** | {summary.get('average_score', 1.0)} |",
            f"| **Average Latency** | {summary.get('avg_duration_ms', 0.0)} ms |",
        ]
    )

    if is_live:
        md.append(f"| **Total Tokens Consumed** | {summary.get('total_tokens', 0)} |")

    md.extend(
        [
            "",
            "## Detailed Case Breakdown",
            "",
        ]
    )

    if is_live:
        md.extend(
            [
                "| Case ID | Category | Model | Tokens | Latency (ms) | Result | Notes / Details |",
                "| :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
            ]
        )
        for r in report_dict.get("results", []):
            cid = r.get("case_id", "UNKNOWN")
            cat = r.get("category", "-")
            mod = r.get("model", "-")
            toks = r.get("token_usage", {}).get("total_tokens", 0)
            lat = r.get("duration_ms", 0.0)
            status = "PASSED" if r.get("passed") else "FAILED"
            reasons = "; ".join(r.get("failure_reasons", [])) or "All checks passed"
            md.append(
                f"| `{cid}` | `{cat}` | `{mod}` | {toks} | {lat} ms | **{status}** | {reasons[:80]} |"
            )
    else:
        md.extend(
            [
                "| Case ID | Category | Language | Provenance | Result | Notes / Details |",
                "| :--- | :--- | :--- | :--- | :--- | :--- |",
            ]
        )
        for r in report_dict.get("results", []):
            cid = r.get("case_id", "UNKNOWN")
            cat = r.get("category", "-")
            lang = r.get("language", "en")
            prov = "Verified" if r.get("is_verified_ground_truth") else "Synthetic"
            status = "PASSED" if r.get("passed") else "FAILED"
            reasons = "; ".join(r.get("failure_reasons", [])) or "All checks passed"
            md.append(f"| `{cid}` | `{cat}` | `{lang}` | {prov} | **{status}** | {reasons[:80]} |")

    md_content = "\n".join(md) + "\n"

    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(md_content)

    return md_content
