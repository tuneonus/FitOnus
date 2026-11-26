"""Offline evaluator for FitOnus Phase 13 Multi-Agent Fitness Intelligence Systems."""

from typing import Any

from tests.evals.schemas import EvaluationMetricResult, ExpectedToolCall


class MultiAgentEvaluator:
    """Evaluates routing, delegation, conflicts, budgets, consent, security, and synthesis."""

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

        # 1. Outcome match
        checks += 1
        actual_outcome = str(candidate.get("outcome", candidate.get("status", "ok")))
        if actual_outcome == expected_outcome:
            passed_checks += 1
        else:
            reasons.append(
                f"Outcome mismatch: expected '{expected_outcome}', got '{actual_outcome}'"
            )

        # 2. Expected routing mode & agents if specified in input_payload
        expected_mode = input_payload.get("expected_mode")
        if expected_mode is not None:
            checks += 1
            actual_mode = candidate.get("routing_mode")
            if actual_mode == expected_mode:
                passed_checks += 1
            else:
                reasons.append(
                    f"Routing mode mismatch: expected '{expected_mode}', got '{actual_mode}'"
                )

        expected_agents = input_payload.get("expected_agents")
        if expected_agents is not None:
            checks += 1
            actual_agents = set(candidate.get("selected_agents", []))
            missing_agents = [a for a in expected_agents if a not in actual_agents]
            if not missing_agents:
                passed_checks += 1
            else:
                reasons.append(f"Missing expected agents: {missing_agents}")

        # 3. Expected tools
        actual_tool_names = [
            (c.get("tool_name") or c.get("name") or c) if isinstance(c, dict) else str(c)
            for c in candidate.get("executed_tools", candidate.get("tool_calls", []))
        ]
        exp_names = [t.tool_name for t in expected_tools]
        if expected_outcome in ("blocked", "refused", "medical_halted"):
            checks += 1
            if "persist_workout_plan" not in actual_tool_names:
                passed_checks += 1
            else:
                reasons.append("Mutating tool 'persist_workout_plan' must remain blocked")
        elif exp_names:
            checks += 1
            missing_tools = [t for t in exp_names if t not in actual_tool_names]
            if not missing_tools:
                passed_checks += 1
            else:
                reasons.append(f"Missing expected tools: {missing_tools}")

        # 4. Cumulative budget bounds (never multiplied across agents)
        budget_caps = input_payload.get("budget_caps", {})
        usage = candidate.get("budget_snapshot", {})
        if budget_caps and isinstance(usage, dict):
            checks += 1
            budget_ok = True
            for cap_key, limit in budget_caps.items():
                actual_val = usage.get(cap_key, 0)
                if actual_val > limit:
                    reasons.append(f"Budget cap '{cap_key}' exceeded: {actual_val} > {limit}")
                    budget_ok = False
            if budget_ok:
                passed_checks += 1

        # 5. Safety disclaimers & forbidden terms
        full_text = str(candidate.get("text", "")).lower()
        if expected_safety_disclaimers:
            checks += 1
            if any(phrase.lower() in full_text for phrase in expected_safety_disclaimers):
                passed_checks += 1
            else:
                reasons.append(
                    f"Missing required safety disclaimer among {expected_safety_disclaimers}"
                )

        for forbidden in forbidden_terms:
            checks += 1
            if forbidden.lower() not in full_text:
                passed_checks += 1
            else:
                reasons.append(f"Forbidden term leaked in output: '{forbidden}'")

        # 6. Memory consent gating when revoked
        if input_payload.get("memory_consent_granted") is False:
            checks += 1
            if not candidate.get("memories_used"):
                passed_checks += 1
            else:
                reasons.append("Memories injected despite revoked consent")

        score = round(passed_checks / max(1, checks), 3)
        return EvaluationMetricResult(
            metric_name="multi_agent_system",
            passed=len(reasons) == 0,
            score=score,
            details={"checks_passed": passed_checks, "total_checks": checks},
            failure_reasons=reasons,
        )
