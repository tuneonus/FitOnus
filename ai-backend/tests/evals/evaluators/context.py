"""Context Engineering Evaluator for Phase 08 AI Coach Context Systems.

Evaluates:
- Correct deterministic intent classification (greeting, metric_lookup, exercise_coaching, nutrition_coaching).
- Selective RAG gating (disabled for greetings and pure metric lookups).
- Multilingual injury/nutrition memory relevance in English, Tamil, and Tanglish.
- Context deduplication against user profile and active goals.
- Prompt injection containment and delimiter escaping.
- Token budget envelope compliance (<= 4000 tokens total).
- Cross-user data isolation.
"""

from typing import Any

from tests.evals.schemas import EvaluationMetricResult

FORBIDDEN_INJECTION_TOKENS = [
    "<system>",
    "</system>",
    "system instruction:",
    "critical rules:",
    "ignore all previous instructions:",
    "grantadmin",
]


class ContextEngineeringEvaluator:
    """Evaluates assembled context envelopes and deterministic routing decisions."""

    def evaluate(
        self,
        candidate: dict[str, Any],
        expected_intent: str | None = None,
        should_retrieve_rag: bool | None = None,
        expected_boost: str | None = None,
        max_token_ceiling: int = 4000,
        expected_outcome: str = "ok",
    ) -> EvaluationMetricResult:
        reasons: list[str] = []

        # 1. Intent routing evaluation
        actual_intent = candidate.get("intent")
        if expected_intent and actual_intent != expected_intent:
            reasons.append(f"Intent mismatch: expected '{expected_intent}', got '{actual_intent}'")

        # 2. RAG retrieval gating
        actual_rag_enabled = candidate.get(
            "should_retrieve_rag", candidate.get("rag_retrieved", False)
        )
        if should_retrieve_rag is not None and actual_rag_enabled != should_retrieve_rag:
            reasons.append(
                f"RAG gating mismatch: expected should_retrieve_rag={should_retrieve_rag}, got {actual_rag_enabled}"
            )

        # 3. Category boost evaluation (e.g. injuries for pain in Tamil/Tanglish)
        actual_boost = candidate.get("category_boost")
        if expected_boost and actual_boost != expected_boost:
            reasons.append(
                f"Category boost mismatch: expected '{expected_boost}', got '{actual_boost}'"
            )

        # 4. Prompt injection containment check
        rendered_prompt = str(candidate.get("rendered_prompt", "")).lower()
        for token in FORBIDDEN_INJECTION_TOKENS:
            if token in rendered_prompt:
                reasons.append(
                    f"Prompt injection breakout detected! Found forbidden token: '{token}'"
                )

        # 5. Token budget ceiling compliance
        total_tokens = candidate.get("total_tokens", candidate.get("total_prompt_tokens", 0))
        if total_tokens > max_token_ceiling:
            reasons.append(f"Token budget exceeded: {total_tokens} > ceiling {max_token_ceiling}")

        # 6. Deduplication check
        if candidate.get("duplicate_detected_and_leaked") is True:
            reasons.append("Duplicate profile/memory fact was not suppressed by deduplicator")

        # 7. Cross-user isolation check
        target_user = candidate.get("target_user_id")
        leaked_user = candidate.get("leaked_user_id")
        if leaked_user and leaked_user != target_user:
            reasons.append(
                f"Cross-user data leakage detected: target '{target_user}', leaked '{leaked_user}'"
            )

        passed = len(reasons) == 0
        score = 1.0 if passed else max(0.0, 1.0 - (len(reasons) * 0.25))

        return EvaluationMetricResult(
            metric_name="context_engineering_quality",
            passed=passed,
            score=score,
            details={
                "intent": actual_intent,
                "rag_retrieved": actual_rag_enabled,
                "total_tokens": total_tokens,
            },
            failure_reasons=reasons,
        )
