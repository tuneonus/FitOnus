"""Tolerance-based nutrition estimation evaluator.

Evaluates whether estimated nutrients fall within defined physiological tolerance bands:
- Calories: +/- 10%
- Protein / Carbs / Fat: +/- 15%
- Serving Weight: +/- 20%

Note: Tolerance bands are empirical evaluation thresholds for testing, not clinical standards.
"""

import sys
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from tests.evals.schemas import EvaluationMetricResult, NutritionMacroTolerance


def _rel_error(actual: float, target: float) -> float:
    if target == 0.0:
        return 0.0 if actual == 0.0 else 1.0
    return abs(actual - target) / target


class NutritionToleranceEvaluator:
    """Evaluates estimated food items against verified ground-truth targets with tolerance bands."""

    def evaluate(
        self,
        actual_items: list[dict[str, Any]],
        expected_items: list[NutritionMacroTolerance],
    ) -> EvaluationMetricResult:
        reasons: list[str] = []

        if not expected_items:
            if not actual_items:
                return EvaluationMetricResult(
                    metric_name="nutrition_tolerance",
                    passed=True,
                    score=1.0,
                    details={"items_evaluated": 0},
                )
            reasons.append(f"Expected no food items, but got {len(actual_items)}")
            return EvaluationMetricResult(
                metric_name="nutrition_tolerance",
                passed=False,
                score=0.0,
                details={"actual_count": len(actual_items)},
                failure_reasons=reasons,
            )

        if len(actual_items) != len(expected_items):
            reasons.append(
                f"Item count mismatch: expected {len(expected_items)} items, got {len(actual_items)}"
            )

        total_checks = 0
        passed_checks = 0

        # Match items by closest name
        for exp in expected_items:
            matching = [
                act
                for act in actual_items
                if exp.name.lower() in str(act.get("name", "")).lower()
                or str(act.get("name", "")).lower() in exp.name.lower()
            ]

            if not matching:
                reasons.append(f"Ground-truth item '{exp.name}' was not detected in output")
                total_checks += 5
                continue

            act = matching[0]

            # 1. Calories check
            act_kcal = float(act.get("calories") or act.get("kcal") or 0.0)
            cal_err = _rel_error(act_kcal, exp.calories)
            total_checks += 1
            if cal_err <= exp.calorie_tolerance_pct:
                passed_checks += 1
            else:
                reasons.append(
                    f"'{exp.name}' calories {act_kcal} kcal outside +/-{int(exp.calorie_tolerance_pct * 100)}% of target {exp.calories} kcal (err={cal_err:.1%})"
                )

            # 2. Protein check
            act_prot = float(
                act.get("proteinG") or act.get("protein_g") or act.get("protein") or 0.0
            )
            prot_err = _rel_error(act_prot, exp.protein_g)
            total_checks += 1
            if prot_err <= exp.macro_tolerance_pct:
                passed_checks += 1
            else:
                reasons.append(
                    f"'{exp.name}' protein {act_prot}g outside +/-{int(exp.macro_tolerance_pct * 100)}% of target {exp.protein_g}g (err={prot_err:.1%})"
                )

            # 3. Carbs check
            act_carbs = float(act.get("carbsG") or act.get("carbs_g") or act.get("carbs") or 0.0)
            carbs_err = _rel_error(act_carbs, exp.carbs_g)
            total_checks += 1
            if carbs_err <= exp.macro_tolerance_pct:
                passed_checks += 1
            else:
                reasons.append(
                    f"'{exp.name}' carbs {act_carbs}g outside +/-{int(exp.macro_tolerance_pct * 100)}% of target {exp.carbs_g}g (err={carbs_err:.1%})"
                )

            # 4. Fat check
            act_fat = float(act.get("fatG") or act.get("fat_g") or act.get("fat") or 0.0)
            fat_err = _rel_error(act_fat, exp.fat_g)
            total_checks += 1
            if fat_err <= exp.macro_tolerance_pct:
                passed_checks += 1
            else:
                reasons.append(
                    f"'{exp.name}' fat {act_fat}g outside +/-{int(exp.macro_tolerance_pct * 100)}% of target {exp.fat_g}g (err={fat_err:.1%})"
                )

            # 5. Serving weight check
            act_weight = float(act.get("servingWeightG") or act.get("serving_weight_g") or 0.0)
            if act_weight > 0 and exp.serving_weight_g > 0:
                wt_err = _rel_error(act_weight, exp.serving_weight_g)
                total_checks += 1
                if wt_err <= exp.weight_tolerance_pct:
                    passed_checks += 1
                else:
                    reasons.append(
                        f"'{exp.name}' weight {act_weight}g outside +/-{int(exp.weight_tolerance_pct * 100)}% of target {exp.serving_weight_g}g (err={wt_err:.1%})"
                    )

        score = passed_checks / max(total_checks, 1)
        passed = len(reasons) == 0

        return EvaluationMetricResult(
            metric_name="nutrition_tolerance",
            passed=passed,
            score=round(score, 3),
            details={
                "passed_checks": passed_checks,
                "total_checks": total_checks,
                "items_matched": len(expected_items)
                - len([r for r in reasons if "was not detected" in r]),
            },
            failure_reasons=reasons,
        )
