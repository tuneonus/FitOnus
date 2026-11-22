"""Evaluator for tool selection accuracy and argument extraction."""

import sys
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from tests.evals.schemas import EvaluationMetricResult, ExpectedToolCall


class ToolSelectionEvaluator:
    """Evaluates whether model triggered expected tools with accurate arguments and zero forbidden keys."""

    def evaluate(
        self,
        actual_tools: list[dict[str, Any]],
        expected_tools: list[ExpectedToolCall],
    ) -> EvaluationMetricResult:
        reasons: list[str] = []

        actual_names = [call.get("name") or call.get("tool_name", "") for call in actual_tools]
        expected_names = [exp.tool_name for exp in expected_tools]

        # 1. Negative expectation: no tools expected
        if not expected_tools:
            if not actual_tools:
                return EvaluationMetricResult(
                    metric_name="tool_selection",
                    passed=True,
                    score=1.0,
                    details={"triggered_count": 0, "expected_count": 0},
                )
            reasons.append(f"Unnecessary tool calls emitted: {actual_names}")
            return EvaluationMetricResult(
                metric_name="tool_selection",
                passed=False,
                score=0.0,
                details={"actual_names": actual_names},
                failure_reasons=reasons,
            )

        # 2. Check for missing or unexpected tools
        missing = [name for name in expected_names if name not in actual_names]
        unexpected = [name for name in actual_names if name not in expected_names]

        if missing:
            reasons.append(f"Missing required tool call(s): {missing}")
        if unexpected:
            reasons.append(f"Unexpected extra tool call(s): {unexpected}")

        # 3. Check arguments for matched tools
        argument_matches = 0
        total_arg_checks = 0

        for exp in expected_tools:
            matching_actuals = [
                call
                for call in actual_tools
                if (call.get("name") or call.get("tool_name")) == exp.tool_name
            ]
            if not matching_actuals:
                continue

            act = matching_actuals[0]
            act_args = act.get("args") or act.get("arguments") or {}

            # Forbidden argument check (e.g. userId must NEVER be passed by model)
            for forbidden in exp.forbidden_arguments:
                if forbidden in act_args:
                    reasons.append(
                        f"Security violation: tool '{exp.tool_name}' emitted forbidden argument '{forbidden}'"
                    )

            # Expected arguments check
            for k, expected_val in exp.arguments.items():
                total_arg_checks += 1
                if k not in act_args:
                    reasons.append(f"Tool '{exp.tool_name}' missing expected argument '{k}'")
                elif act_args[k] != expected_val:
                    reasons.append(
                        f"Tool '{exp.tool_name}' argument '{k}': expected {expected_val}, got {act_args[k]}"
                    )
                else:
                    argument_matches += 1

        # Calculate F1-style score
        precision = len([name for name in actual_names if name in expected_names]) / max(
            len(actual_names), 1
        )
        recall = len([name for name in expected_names if name in actual_names]) / max(
            len(expected_names), 1
        )
        arg_acc = (argument_matches / max(total_arg_checks, 1)) if total_arg_checks > 0 else 1.0

        score = (precision * 0.4) + (recall * 0.4) + (arg_acc * 0.2)
        passed = len(reasons) == 0

        return EvaluationMetricResult(
            metric_name="tool_selection",
            passed=passed,
            score=round(score, 3),
            details={
                "precision": round(precision, 2),
                "recall": round(recall, 2),
                "argument_accuracy": round(arg_acc, 2),
                "actual_tools": actual_names,
                "expected_tools": expected_names,
            },
            failure_reasons=reasons,
        )
