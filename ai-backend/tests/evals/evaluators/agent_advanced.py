"""Advanced Agent Evaluator: routing accuracy, arg schemas, budgets, fallbacks, security.

Composes existing `ToolSelectionEvaluator` and shared Pydantic tool argument schemas
(`TOOL_ARG_SCHEMAS`) to evaluate single-agent, LangGraph, and Multi-Agent behaviors cleanly
without duplicating existing baseline evaluators.
"""

from typing import Any

from tests.evals.evaluators.tools import ToolSelectionEvaluator
from tests.evals.schemas import EvaluationMetricResult, ExpectedToolCall

from onusfit_ai.shared.contracts.tools import TOOL_ARG_SCHEMAS


class AdvancedAgentEvaluator:
    """Evaluates routing, tool selection & schema args, task completion, budgets, and fallback."""

    def __init__(self) -> None:
        self._tool_eval = ToolSelectionEvaluator()

    def evaluate(
        self,
        *,
        candidate: dict[str, Any],
        input_payload: dict[str, Any],
        expected_tools: list[ExpectedToolCall] | None = None,
        expected_outcome: str = "ok",
        forbidden_terms: list[str] | None = None,
    ) -> EvaluationMetricResult:
        reasons: list[str] = []
        checks = 0
        passed_checks = 0
        expected_tools = expected_tools or []
        forbidden_terms = forbidden_terms or []

        # 1. Task completion / outcome check
        checks += 1
        actual_outcome = str(candidate.get("outcome", candidate.get("status", "ok")))
        if actual_outcome == expected_outcome:
            passed_checks += 1
        else:
            reasons.append(
                f"Task completion outcome mismatch: expected '{expected_outcome}', got '{actual_outcome}'"
            )

        # 2. Routing accuracy (mode, selected agents, bypass flag)
        exp_mode = input_payload.get("expected_routing_mode")
        if exp_mode is not None:
            checks += 1
            act_mode = candidate.get("routing_mode")
            if act_mode == exp_mode:
                passed_checks += 1
            else:
                reasons.append(
                    f"Routing accuracy failure: expected mode '{exp_mode}', got '{act_mode}'"
                )

        exp_agents = input_payload.get("expected_agents")
        if exp_agents is not None:
            checks += 1
            act_agents = set(candidate.get("selected_agents", []))
            missing_agents = [a for a in exp_agents if a not in act_agents]
            if not missing_agents:
                passed_checks += 1
            else:
                reasons.append(f"Agent routing missed specialist(s): {missing_agents}")

        if "expected_bypass" in input_payload:
            checks += 1
            act_bypass = bool(candidate.get("bypassed", False))
            if act_bypass is bool(input_payload["expected_bypass"]):
                passed_checks += 1
            else:
                reasons.append(
                    f"Bypass decision mismatch: expected {input_payload['expected_bypass']}, got {act_bypass}"
                )

        # 3. Tool selection & strict schema argument validation
        actual_tools = list(candidate.get("executed_tools", candidate.get("tool_calls", [])))
        if expected_tools or input_payload.get("assert_no_tools"):
            checks += 1
            t_res = self._tool_eval.evaluate(actual_tools, expected_tools)
            if t_res.passed:
                passed_checks += 1
            else:
                reasons.extend(t_res.failure_reasons)

        for call in actual_tools:
            tool_name = str(call.get("name") or call.get("tool_name") or "")
            args = call.get("args") or call.get("arguments") or {}
            schema = TOOL_ARG_SCHEMAS.get(tool_name)
            if schema is not None:
                checks += 1
                try:
                    schema.model_validate(args)
                    passed_checks += 1
                except Exception as exc:
                    reasons.append(f"Tool argument schema violation for '{tool_name}': {exc}")

        # 4. Budget compliance (iterations, tool calls, replans, tokens, latency)
        budgets: dict[str, Any] = input_payload.get("budget_limits", {})
        for key, max_allowed in budgets.items():
            checks += 1
            actual_val = candidate.get(key, 0)
            if actual_val <= max_allowed:
                passed_checks += 1
            else:
                reasons.append(f"Budget limit exceeded for '{key}': {actual_val} > {max_allowed}")

        # 5. Fallback behavior check
        if "expected_fallback_used" in input_payload:
            checks += 1
            act_fb = bool(candidate.get("fallback_used", False))
            if act_fb is bool(input_payload["expected_fallback_used"]):
                passed_checks += 1
            else:
                reasons.append(
                    f"Fallback execution mismatch: expected {input_payload['expected_fallback_used']}, got {act_fb}"
                )

        # 6. Anti-injection / forbidden term / cross-user isolation check
        resp_text = str(candidate.get("text", "")).lower()
        for term in forbidden_terms:
            checks += 1
            if term.lower() not in resp_text:
                passed_checks += 1
            else:
                reasons.append(f"Forbidden response term detected: '{term}'")

        score = round(passed_checks / max(1, checks), 3)
        passed = len(reasons) == 0
        if not passed:
            score = min(score, round(max(0.0, 1.0 - 0.2 * len(reasons)), 3))

        return EvaluationMetricResult(
            metric_name="agent_advanced",
            passed=passed,
            score=score,
            details={"checks_passed": passed_checks, "total_checks": checks},
            failure_reasons=reasons,
            failure_classification="none" if passed else "agent_failure",
        )
