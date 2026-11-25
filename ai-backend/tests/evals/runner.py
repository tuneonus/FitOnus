"""CLI Evaluation Runner for OnusFit AI.

Modes:
- Default: OFFLINE ONLY (0 API calls, $0 cost, deterministic schema and rule evaluation).
- Optional: LIVE (--live flag required; invokes real Gemini API or injected TextGenerator).

Reporting:
- Emits JSON and Markdown reports.
- If live mode is not run, outputs 'LIVE BASELINE: NOT MEASURED'.
"""

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

_TESTS_ROOT = Path(__file__).resolve().parent.parent.parent
if str(_TESTS_ROOT) not in sys.path:
    sys.path.insert(0, str(_TESTS_ROOT))

_SRC_ROOT = _TESTS_ROOT / "src"
if str(_SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(_SRC_ROOT))

from tests.evals.datasets.loader import load_all_benchmark_cases, load_benchmark_dataset
from tests.evals.evaluators.agent import AgentFundamentalsEvaluator
from tests.evals.evaluators.grounding import FactualGroundingEvaluator
from tests.evals.evaluators.mcp import McpToolsEvaluator
from tests.evals.evaluators.multi_agent import MultiAgentEvaluator
from tests.evals.evaluators.multilingual import MultilingualAccuracyEvaluator
from tests.evals.evaluators.nutrition import NutritionToleranceEvaluator
from tests.evals.evaluators.safety import SafetyEvaluator
from tests.evals.evaluators.schema import SchemaConformanceEvaluator
from tests.evals.evaluators.tools import ToolSelectionEvaluator
from tests.evals.reporter import generate_json_report, generate_markdown_report

from onusfit_ai.features.coach.application.schemas import (
    GeminiCoachInsightsOutput,
    GeminiCoachReplyOutput,
)
from onusfit_ai.features.meals.application.schemas import (
    GeminiPhotoMealOutput,
    GeminiVoiceMealOutput,
)
from onusfit_ai.features.speech.application.schemas import GeminiTranscribeOutput
from onusfit_ai.shared.llm.gemini import GeminiClient, get_coach_tools
from onusfit_ai.shared.llm.ports import TextGenerator


def run_offline_evaluation(dataset_key: str | None = None) -> list[dict[str, Any]]:
    """Execute deterministic offline evaluation across benchmark cases using Stage 03 evaluators."""
    cases = (
        load_benchmark_dataset(dataset_key)
        if dataset_key and dataset_key != "all"
        else load_all_benchmark_cases()
    )

    schema_evaluators = {
        "coach_chat": SchemaConformanceEvaluator(GeminiCoachReplyOutput),
        "coach_insights": SchemaConformanceEvaluator(GeminiCoachInsightsOutput),
        "meal_photo": SchemaConformanceEvaluator(GeminiPhotoMealOutput),
        "voice_meal": SchemaConformanceEvaluator(GeminiVoiceMealOutput),
        "speech_transcribe": SchemaConformanceEvaluator(GeminiTranscribeOutput),
    }

    tool_eval = ToolSelectionEvaluator()
    nutr_eval = NutritionToleranceEvaluator()
    ground_eval = FactualGroundingEvaluator()
    lang_eval = MultilingualAccuracyEvaluator()
    safety_eval = SafetyEvaluator()
    agent_eval = AgentFundamentalsEvaluator()
    mcp_eval = McpToolsEvaluator()
    multi_eval = MultiAgentEvaluator()

    results: list[dict[str, Any]] = []

    for case in cases:
        start_t = time.perf_counter()
        failure_reasons: list[str] = []
        scores: list[float] = []

        cand = case.offline_candidate
        if cand is None:
            failure_reasons.append(f"Case '{case.case_id}' missing offline candidate payload")
            results.append(
                {
                    "case_id": case.case_id,
                    "category": case.category,
                    "language": case.language,
                    "is_verified_ground_truth": case.is_verified_ground_truth,
                    "passed": False,
                    "score": 0.0,
                    "failure_reasons": failure_reasons,
                    "duration_ms": round((time.perf_counter() - start_t) * 1000, 2),
                }
            )
            continue

        # 1. Schema conformance evaluation
        if case.category in schema_evaluators:
            res = schema_evaluators[case.category].evaluate(cand)
            scores.append(res.score)
            if not res.passed:
                failure_reasons.extend(res.failure_reasons)

        # 2. Tool selection accuracy evaluation
        if case.category == "function_calling":
            actual_tools = cand.get("tool_calls", [])
            res = tool_eval.evaluate(actual_tools, case.expected_tools)
            scores.append(res.score)
            if not res.passed:
                failure_reasons.extend(res.failure_reasons)

        # 3. Nutrition physiological tolerance evaluation
        if case.category in ("meal_photo", "voice_meal"):
            actual_items = cand.get("items", [])
            res = nutr_eval.evaluate(actual_items, case.expected_nutrition)
            scores.append(res.score)
            if not res.passed:
                failure_reasons.extend(res.failure_reasons)

        # 4. Multilingual transcription & dialect evaluation
        if case.category in ("speech_transcribe", "multilingual_dialect"):
            actual_transcript = cand.get("transcript", cand.get("text", ""))
            det_lang = cand.get("detectedLanguage", cand.get("detected_language", ""))
            res = lang_eval.evaluate(
                actual_transcript=actual_transcript,
                detected_language=det_lang,
                expected_language=case.language,
                expected_entities=case.input_payload.get("expected_entities"),
            )
            scores.append(res.score)
            if not res.passed:
                failure_reasons.extend(res.failure_reasons)

        # 5. Safety & clinical disclaimer compliance evaluation
        if (
            case.category == "fitness_safety"
            or (
                case.category not in ("workout_planner", "mcp_tools", "multi_agent")
                and (
                    case.expected_safety_disclaimers
                    or case.forbidden_terms
                    or case.expected_outcome in ("refusal", "medical_escalation")
                )
            )
        ):
            text = cand.get("text", "")
            res = safety_eval.evaluate(
                text,
                expected_disclaimers=case.expected_safety_disclaimers,
                forbidden_terms=case.forbidden_terms,
                is_medical_case=(case.expected_outcome == "medical_escalation"),
            )
            scores.append(res.score)
            if not res.passed:
                failure_reasons.extend(res.failure_reasons)

        # 5b. Agent Fundamentals evaluation
        if case.category == "agent_fundamentals":
            res = agent_eval.evaluate(
                candidate=cand,
                expected_goal_type=cand.get("goal_type"),
                expected_tools=case.expected_tools,
                expected_language=case.language,
                requires_agent_execution=cand.get("requires_agent_execution"),
                max_iterations=3,
                max_tool_calls=5,
                max_replans=1,
                forbidden_terms=case.forbidden_terms,
                expected_outcome=case.expected_outcome,
            )
            scores.append(res.score)
            if not res.passed:
                failure_reasons.extend(res.failure_reasons)

        # 5c. Workout Planner evaluation
        if case.category == "workout_planner":
            if case.expected_outcome in ("refusal", "medical_escalation"):
                disclaimers = case.expected_safety_disclaimers
                has_disclaimer = cand.get("disclaimer_present", False) or any(
                    d in cand.get("text", "").lower() for d in disclaimers
                )
                if has_disclaimer:
                    scores.append(1.0)
                else:
                    failure_reasons.append("Medical case missing clinical disclaimer")
            elif case.expected_outcome == "validation_error":
                if not cand.get("is_valid", True) or cand.get("status") == "failed":
                    scores.append(1.0)
                else:
                    failure_reasons.append("Expected validation failure not detected")
            else:
                if cand.get("status") in ("completed", "adapted"):
                    scores.append(1.0)
                else:
                    failure_reasons.append(f"Unexpected status: {cand.get('status')}")

        # 5d. MCP Tools evaluation
        if case.category == "mcp_tools":
            res = mcp_eval.evaluate(
                candidate=cand,
                expected_tools=case.expected_tools,
                expected_outcome=case.expected_outcome,
                forbidden_terms=case.forbidden_terms,
            )
            scores.append(res.score)
            if not res.passed:
                failure_reasons.extend(res.failure_reasons)

        # 5e. Multi-Agent Systems evaluation
        if case.category == "multi_agent":
            res = multi_eval.evaluate(
                candidate=cand,
                expected_tools=case.expected_tools,
                expected_outcome=case.expected_outcome,
                expected_safety_disclaimers=case.expected_safety_disclaimers,
                forbidden_terms=case.forbidden_terms,
                input_payload=case.input_payload,
            )
            scores.append(res.score)
            if not res.passed:
                failure_reasons.extend(res.failure_reasons)

        # 6. Factual grounding against structured user context
        if case.input_payload.get("context"):
            ctx = case.input_payload.get("context", {})
            text = cand.get("text", "")
            if not text and "insights" in cand:
                text = f"{cand.get('greeting', '')} {cand.get('recommendation', '')} " + " ".join(
                    i.get("description", "") for i in cand.get("insights", [])
                )
            if text:
                res = ground_eval.evaluate(text, ctx)
                scores.append(res.score)
                if not res.passed:
                    failure_reasons.extend(res.failure_reasons)

        elapsed_ms = (time.perf_counter() - start_t) * 1000
        passed = len(failure_reasons) == 0
        final_score = round(sum(scores) / max(len(scores), 1), 3) if passed else 0.0

        results.append(
            {
                "case_id": case.case_id,
                "category": case.category,
                "language": case.language,
                "is_verified_ground_truth": case.is_verified_ground_truth,
                "passed": passed,
                "score": final_score,
                "failure_reasons": failure_reasons,
                "duration_ms": round(elapsed_ms, 2),
            }
        )

    return results


async def run_live_evaluation(
    dataset_key: str | None = None,
    trials: int = 1,
    llm: TextGenerator | None = None,
    primary_model: str | None = None,
    fallback_model: str | None = None,
) -> list[dict[str, Any]]:
    """Execute live model benchmarking against Gemini API or injected TextGenerator.

    Guards:
    - Never runs without explicit authorization.
    - Requires GEMINI_API_KEY in environment unless llm is explicitly injected.
    """
    if llm is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            print("[WARNING] LIVE BASELINE: NOT MEASURED (No GEMINI_API_KEY found).")
            return []
        llm = GeminiClient(api_key=api_key)

    primary = primary_model or os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    fallback = fallback_model or os.getenv("GEMINI_FALLBACK_MODEL", "gemini-2.5-flash-lite")

    cases = (
        load_benchmark_dataset(dataset_key)
        if dataset_key and dataset_key != "all"
        else load_all_benchmark_cases()
    )

    schema_evaluators = {
        "coach_chat": SchemaConformanceEvaluator(GeminiCoachReplyOutput),
        "coach_insights": SchemaConformanceEvaluator(GeminiCoachInsightsOutput),
        "meal_photo": SchemaConformanceEvaluator(GeminiPhotoMealOutput),
        "voice_meal": SchemaConformanceEvaluator(GeminiVoiceMealOutput),
        "speech_transcribe": SchemaConformanceEvaluator(GeminiTranscribeOutput),
    }

    tool_eval = ToolSelectionEvaluator()
    nutr_eval = NutritionToleranceEvaluator()
    ground_eval = FactualGroundingEvaluator()
    lang_eval = MultilingualAccuracyEvaluator()
    safety_eval = SafetyEvaluator()

    results: list[dict[str, Any]] = []

    for case in cases:
        for _ in range(trials):
            start_t = time.perf_counter()
            failure_reasons: list[str] = []
            scores: list[float] = []

            prompt = ""
            schema_class = None
            tools = None

            if case.category == "coach_chat":
                msg = case.input_payload.get("user_message") or case.input_payload.get(
                    "message", ""
                )
                ctx = case.input_payload.get("context")
                prompt = f"User: {msg}\nContext: {json.dumps(ctx)}" if ctx else f"User: {msg}"
                schema_class = GeminiCoachReplyOutput
            elif case.category == "coach_insights":
                prompt = f"Generate insights for user context:\n{json.dumps(case.input_payload)}"
                schema_class = GeminiCoachInsightsOutput
            elif case.category == "meal_photo":
                prompt = f"Analyze meal photo caption: {case.input_payload.get('caption', case.description)}"
                schema_class = GeminiPhotoMealOutput
            elif case.category == "voice_meal":
                prompt = f"Extract meal from voice transcript: {case.input_payload.get('transcript', case.description)}"
                schema_class = GeminiVoiceMealOutput
            elif case.category in ("speech_transcribe", "multilingual_dialect"):
                prompt = f"Transcribe and detect language: {case.input_payload.get('transcript', case.description)}"
                schema_class = GeminiTranscribeOutput
            elif case.category == "function_calling":
                prompt = case.input_payload.get("message", case.description)
                tools = get_coach_tools()
            elif case.category == "fitness_safety":
                prompt = case.input_payload.get("message", case.description)

            try:
                llm_res = await llm.generate_text(
                    prompt=prompt,
                    primary_model=primary,
                    fallback_model=fallback,
                    deadline_s=30.0,
                    schema=schema_class,
                    tools=tools,
                )
                duration_ms = (
                    llm_res.usage.duration_ms
                    if llm_res.usage.duration_ms > 0
                    else round((time.perf_counter() - start_t) * 1000, 2)
                )

                token_usage = {
                    "model": llm_res.usage.model,
                    "is_fallback": llm_res.usage.is_fallback,
                    "input_tokens": llm_res.usage.input_tokens,
                    "output_tokens": llm_res.usage.output_tokens,
                    "total_tokens": llm_res.usage.total_tokens,
                }

                candidate: dict[str, Any] = {}
                if llm_res.parsed is not None:
                    if hasattr(llm_res.parsed, "model_dump"):
                        candidate = llm_res.parsed.model_dump(by_alias=True)
                    elif isinstance(llm_res.parsed, dict):
                        candidate = llm_res.parsed
                elif llm_res.text:
                    try:
                        candidate = json.loads(llm_res.text)
                    except Exception:
                        candidate = {"text": llm_res.text}
                else:
                    candidate = {"text": ""}

                if llm_res.tool_calls:
                    candidate["tool_calls"] = [
                        {"name": tc.tool_name, "args": tc.args} for tc in llm_res.tool_calls
                    ]

                if case.category in schema_evaluators:
                    res = schema_evaluators[case.category].evaluate(candidate)
                    scores.append(res.score)
                    if not res.passed:
                        failure_reasons.extend(res.failure_reasons)

                if case.category == "function_calling":
                    actual_tools = candidate.get("tool_calls", [])
                    res = tool_eval.evaluate(actual_tools, case.expected_tools)
                    scores.append(res.score)
                    if not res.passed:
                        failure_reasons.extend(res.failure_reasons)

                if case.category in ("meal_photo", "voice_meal"):
                    actual_items = candidate.get("items", [])
                    res = nutr_eval.evaluate(actual_items, case.expected_nutrition)
                    scores.append(res.score)
                    if not res.passed:
                        failure_reasons.extend(res.failure_reasons)

                if case.category in ("speech_transcribe", "multilingual_dialect"):
                    actual_transcript = candidate.get("transcript", candidate.get("text", ""))
                    det_lang = candidate.get(
                        "detectedLanguage", candidate.get("detected_language", "")
                    )
                    res = lang_eval.evaluate(
                        actual_transcript=actual_transcript,
                        detected_language=det_lang,
                        expected_language=case.language,
                        expected_entities=case.input_payload.get("expected_entities"),
                    )
                    scores.append(res.score)
                    if not res.passed:
                        failure_reasons.extend(res.failure_reasons)

                if (
                    case.category == "fitness_safety"
                    or case.expected_safety_disclaimers
                    or case.forbidden_terms
                    or case.expected_outcome in ("refusal", "medical_escalation")
                ):
                    text = candidate.get("text", "")
                    res = safety_eval.evaluate(
                        text,
                        expected_disclaimers=case.expected_safety_disclaimers,
                        forbidden_terms=case.forbidden_terms,
                        is_medical_case=(case.expected_outcome == "medical_escalation"),
                    )
                    scores.append(res.score)
                    if not res.passed:
                        failure_reasons.extend(res.failure_reasons)

                if case.input_payload.get("context"):
                    ctx = case.input_payload.get("context", {})
                    text = candidate.get("text", "")
                    if not text and "insights" in candidate:
                        text = (
                            f"{candidate.get('greeting', '')} {candidate.get('recommendation', '')} "
                            + " ".join(
                                i.get("description", "") for i in candidate.get("insights", [])
                            )
                        )
                    if text:
                        res = ground_eval.evaluate(text, ctx)
                        scores.append(res.score)
                        if not res.passed:
                            failure_reasons.extend(res.failure_reasons)

                passed = len(failure_reasons) == 0
                final_score = round(sum(scores) / max(len(scores), 1), 3) if passed else 0.0

                results.append(
                    {
                        "case_id": case.case_id,
                        "category": case.category,
                        "language": case.language,
                        "is_verified_ground_truth": case.is_verified_ground_truth,
                        "passed": passed,
                        "score": final_score,
                        "failure_reasons": failure_reasons,
                        "duration_ms": duration_ms,
                        "token_usage": token_usage,
                        "model": llm_res.usage.model,
                        "is_fallback": llm_res.usage.is_fallback,
                    }
                )

            except Exception as err:
                duration_ms = round((time.perf_counter() - start_t) * 1000, 2)
                results.append(
                    {
                        "case_id": case.case_id,
                        "category": case.category,
                        "language": case.language,
                        "is_verified_ground_truth": case.is_verified_ground_truth,
                        "passed": False,
                        "score": 0.0,
                        "failure_reasons": [f"Live model execution error: {err}"],
                        "duration_ms": duration_ms,
                        "token_usage": {
                            "model": primary,
                            "is_fallback": False,
                            "total_tokens": 0,
                        },
                        "model": primary,
                        "is_fallback": False,
                    }
                )

    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="OnusFit AI Evaluation & Benchmark Runner")
    parser.add_argument(
        "--live",
        action="store_true",
        default=False,
        help="Enable live Gemini model calls (requires GEMINI_API_KEY)",
    )
    parser.add_argument(
        "--dataset",
        type=str,
        default="all",
        help="Dataset key to evaluate: coach_chat, nutrition, speech, tools, safety, or all",
    )
    parser.add_argument(
        "--output-json",
        type=str,
        default="tests/evals/results/eval_report.json",
        help="Path to save JSON report",
    )
    parser.add_argument(
        "--output-md",
        type=str,
        default="tests/evals/results/eval_report.md",
        help="Path to save Markdown report",
    )
    parser.add_argument(
        "--trials", type=int, default=1, help="Number of trials per test case in live mode"
    )

    args = parser.parse_args()

    mode = "live" if args.live else "offline"
    print(f"[OnusFit AI Evaluation] Starting evaluation in {mode.upper()} mode...")

    if args.live:
        print("[INFO] Live mode requested. Checking API authorization...")
        case_results = asyncio.run(run_live_evaluation(args.dataset, args.trials))
        if not case_results:
            print(
                "[INFO] Live requests bypassed or unconfigured. Falling back to offline contract evaluation."
            )
            mode = "offline"
            case_results = run_offline_evaluation(args.dataset)
    else:
        print("[INFO] Executing deterministic offline evaluation (0 external API calls)...")
        case_results = run_offline_evaluation(args.dataset)

    # Generate Reports
    json_path = Path(args.output_json) if args.output_json else None
    md_path = Path(args.output_md) if args.output_md else None

    report = generate_json_report(eval_mode=mode, case_results=case_results, output_path=json_path)
    generate_markdown_report(report, output_path=md_path)

    print("\n" + "=" * 60)
    print(f"EVALUATION COMPLETE | Mode: {mode.upper()}")
    print(
        f"Total Cases: {report['summary']['total_cases']} | Passed: {report['summary']['passed_cases']} | Failed: {report['summary']['failed_cases']}"
    )
    print(f"Pass Rate: {report['summary']['pass_rate_pct']}%")
    print(f"Live Baseline Status: {report['live_baseline_status']}")
    if json_path:
        print(f"JSON Report: {json_path}")
    if md_path:
        print(f"Markdown Report: {md_path}")
    print("=" * 60 + "\n")

    return 0 if report["summary"]["failed_cases"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
