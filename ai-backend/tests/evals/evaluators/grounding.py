"""Evaluator for factual grounding against structured user context.

Evaluates supported numeric facts in LLM responses against provided user fitness context:
- Weight measurements (kg)
- Calorie counts (kcal)
- Protein grams
- Workout volume & set counts

Note: This evaluates structured numeric and entity assertions against context; it does not claim
open-ended hallucination detection for general creative prose.
"""

import re
import sys
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from tests.evals.schemas import EvaluationMetricResult


class FactualGroundingEvaluator:
    """Evaluates whether facts asserted in model response exist in provided context."""

    def evaluate(self, response_text: str, context: dict[str, Any]) -> EvaluationMetricResult:
        reasons: list[str] = []

        # Extract context ground truth numbers
        context_numbers: set[float] = set()

        def _harvest_numbers(obj: Any) -> None:
            if isinstance(obj, (int, float)) and not isinstance(obj, bool):
                context_numbers.add(float(obj))
            elif isinstance(obj, dict):
                for v in obj.values():
                    _harvest_numbers(v)
            elif isinstance(obj, list):
                for item in obj:
                    _harvest_numbers(item)

        _harvest_numbers(context)

        # Extract explicit claims with units from response text: e.g. "80kg", "140g", "2100 kcal"
        claims = re.findall(
            r"(\d+(?:\.\d+)?)\s*(kg|grams?|g|kcal|calories|sets|minutes)\b",
            response_text,
            re.IGNORECASE,
        )

        total_claims = len(claims)
        supported_claims = 0

        for val_str, unit in claims:
            val = float(val_str)
            # Check if this exact number exists in context, or is standard guidance (e.g. 500ml water, 3-5g creatine)
            is_in_context = val in context_numbers
            is_common_guideline = val in {2.5, 3.0, 5.0, 8.0, 20.0, 30.0, 500.0, 1000.0}

            if is_in_context or is_common_guideline:
                supported_claims += 1
            else:
                # Potential hallucination of personal fitness metric
                if unit.lower() in ("kg", "kcal", "calories") and val > 40:
                    reasons.append(
                        f"Unsubstantiated personal metric claim: '{val_str} {unit}' not found in user context"
                    )

        score = (supported_claims / max(total_claims, 1)) if total_claims > 0 else 1.0
        passed = len(reasons) == 0

        return EvaluationMetricResult(
            metric_name="factual_grounding",
            passed=passed,
            score=round(score, 3),
            details={
                "total_claims_detected": total_claims,
                "supported_claims": supported_claims,
                "context_numbers_count": len(context_numbers),
            },
            failure_reasons=reasons,
        )
