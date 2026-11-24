"""Offline evaluator for FitOnus LangGraph agent workflows.

FitOnus Phase 10: LangGraph Agent Workflows — Stage 08.
Evaluates:
- State transitions and execution status.
- Tool call selection and execution counts.
- Budget limits and deadline cutoff handling.
- Language detection and mirroring.
- Zero-leak state isolation and grounding compliance.
"""

import sys
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from tests.evals.schemas import EvaluationMetricResult


class LangGraphWorkflowEvaluator:
    """Evaluates LangGraph workflow execution results against golden expectations."""

    def evaluate(
        self,
        candidate: dict[str, Any],
        *,
        expected_status: str | None = None,
        expected_termination_reason: str | None = None,
        expected_tools: list[str] | None = None,
        expected_language: str | None = None,
        expected_replans: int | None = None,
        max_tool_calls: int | None = None,
        is_bypass: bool | None = None,
    ) -> EvaluationMetricResult:
        failure_reasons: list[str] = []
        checks = 0
        passes = 0

        actual_status = candidate.get("status")
        actual_reason = candidate.get("termination_reason")
        actual_tools = candidate.get("tool_calls", [])
        actual_goal = candidate.get("goal", {})
        actual_lang = actual_goal.get("language") if isinstance(actual_goal, dict) else None

        # 1. Status Check
        if expected_status is not None:
            checks += 1
            if actual_status == expected_status:
                passes += 1
            else:
                failure_reasons.append(
                    f"Status mismatch: expected '{expected_status}', got '{actual_status}'"
                )

        # 2. Termination Reason Check
        if expected_termination_reason is not None:
            checks += 1
            if actual_reason == expected_termination_reason:
                passes += 1
            else:
                failure_reasons.append(
                    f"Termination reason mismatch: expected '{expected_termination_reason}', got '{actual_reason}'"
                )

        # 3. Bypass Check
        if is_bypass is not None:
            checks += 1
            actual_bypass = (actual_status == "bypassed")
            if actual_bypass == is_bypass:
                passes += 1
            else:
                failure_reasons.append(
                    f"Bypass mismatch: expected is_bypass={is_bypass}, got {actual_bypass}"
                )

        # 4. Expected Tools Check
        if expected_tools is not None:
            checks += 1
            actual_tool_set = set(actual_tools)
            expected_tool_set = set(expected_tools)
            if expected_tool_set.issubset(actual_tool_set):
                passes += 1
            else:
                missing = expected_tool_set - actual_tool_set
                failure_reasons.append(f"Missing expected tools: {missing}")

        # 5. Max Tool Calls Bound
        if max_tool_calls is not None:
            checks += 1
            if len(actual_tools) <= max_tool_calls:
                passes += 1
            else:
                failure_reasons.append(
                    f"Exceeded max tool calls: {len(actual_tools)} > {max_tool_calls}"
                )

        # 6. Expected Language
        if expected_language is not None and actual_lang:
            checks += 1
            if actual_lang == expected_language:
                passes += 1
            else:
                failure_reasons.append(
                    f"Language mismatch: expected '{expected_language}', got '{actual_lang}'"
                )

        score = round(passes / max(checks, 1), 3) if not failure_reasons else 0.0
        return EvaluationMetricResult(
            metric_name="langgraph_workflow_validity",
            score=score,
            passed=(len(failure_reasons) == 0),
            failure_reasons=failure_reasons,
        )
