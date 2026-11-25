"""Advanced Multimodal & Multilingual Speech Evaluation Engine.

Composes `NutritionToleranceEvaluator`, `MultilingualAccuracyEvaluator`, and
`SafetyEvaluator`, adding:
- Food identification precision, recall, and F1 against ground-truth items
- Word Error Rate (WER) for English, Tamil, and Tanglish transcription
- Portion uncertainty & low-confidence calibration checks
"""

from typing import Any

from tests.evals.evaluators.multilingual import (
    MultilingualAccuracyEvaluator,
    extract_tanglish_quantity,
    normalize_tanglish,
)
from tests.evals.evaluators.nutrition import NutritionToleranceEvaluator
from tests.evals.evaluators.safety import SafetyEvaluator
from tests.evals.schemas import EvaluationMetricResult, NutritionMacroTolerance


def compute_word_error_rate(reference: str, hypothesis: str) -> float:
    """Compute normalized Word Error Rate (Levenshtein edit distance / ref words)."""
    ref_words = normalize_tanglish(reference).split()
    hyp_words = normalize_tanglish(hypothesis).split()
    if not ref_words:
        return 0.0 if not hyp_words else 1.0

    prev = list(range(len(hyp_words) + 1))
    for i, r_w in enumerate(ref_words, start=1):
        curr = [i]
        for j, h_w in enumerate(hyp_words, start=1):
            cost = 0 if r_w == h_w else 1
            curr.append(min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost))
        prev = curr
    return round(min(1.0, prev[-1] / len(ref_words)), 4)


class MultimodalAdvancedEvaluator:
    """Evaluates food identification F1, IFCT/USDA macro tolerances, uncertainty, and speech WER."""

    def __init__(self) -> None:
        self._nutrition = NutritionToleranceEvaluator()
        self._multilingual = MultilingualAccuracyEvaluator()
        self._safety = SafetyEvaluator()

    def evaluate(
        self,
        *,
        candidate: dict[str, Any],
        input_payload: dict[str, Any],
        expected_nutrition: list[NutritionMacroTolerance] | None = None,
        expected_language: str = "en",
        expected_outcome: str = "ok",
        forbidden_terms: list[str] | None = None,
    ) -> EvaluationMetricResult:
        reasons: list[str] = []
        sub_scores: list[float] = []
        expected_nutrition = expected_nutrition or []
        forbidden_terms = forbidden_terms or []

        # 1. Outcome match
        actual_outcome = str(candidate.get("outcome", "ok"))
        if actual_outcome != expected_outcome:
            reasons.append(
                f"Outcome mismatch: expected '{expected_outcome}', got '{actual_outcome}'"
            )
            sub_scores.append(0.0)
        else:
            sub_scores.append(1.0)

        # 2. Food identification precision / recall / F1
        actual_items = list(candidate.get("items", []))
        expected_names = [
            normalize_tanglish(str(n))
            for n in input_payload.get("expected_food_names", [t.name for t in expected_nutrition])
        ]
        actual_names = [normalize_tanglish(str(it.get("name", ""))) for it in actual_items]

        if expected_names:
            matched_exp = 0
            for exp_n in expected_names:
                if any(exp_n in act_n or act_n in exp_n for act_n in actual_names):
                    matched_exp += 1
            matched_act = 0
            for act_n in actual_names:
                if any(exp_n in act_n or act_n in exp_n for exp_n in expected_names):
                    matched_act += 1
            food_rec = matched_exp / len(expected_names)
            food_prec = matched_act / max(1, len(actual_names))
            food_f1 = (
                (2 * food_prec * food_rec) / (food_prec + food_rec)
                if (food_prec + food_rec) > 0
                else 0.0
            )
            sub_scores.append(round(food_f1, 4))
            min_f1 = float(input_payload.get("min_food_f1", 0.8))
            if food_f1 < min_f1:
                reasons.append(f"Food identification F1 below target: {food_f1:.3f} < {min_f1}")
        else:
            food_f1 = 1.0 if not actual_names or expected_outcome != "no_food" else 0.0
            if expected_outcome == "no_food" and actual_items:
                reasons.append(f"Expected 0 food items for no_food case, got {len(actual_items)}")

        # 3. Macro nutrition tolerance checks
        if expected_nutrition and actual_outcome == "ok":
            nut_res = self._nutrition.evaluate(actual_items, expected_nutrition)
            sub_scores.append(nut_res.score)
            if not nut_res.passed:
                reasons.extend(nut_res.failure_reasons)

        # 4. Portion uncertainty & confidence calibration checks
        if input_payload.get("requires_uncertainty"):
            has_uncertain_note = bool(
                candidate.get("unclearReason") or candidate.get("uncertaintyNote")
            )
            conf_word = str(candidate.get("confidence", "")).lower()
            conf_score = float(candidate.get("overallConfidence", 1.0))
            max_conf = float(input_payload.get("max_confidence", 0.7))
            unc_ok = (
                has_uncertain_note and conf_score <= max_conf and conf_word in ("low", "medium")
            )
            sub_scores.append(1.0 if unc_ok else 0.0)
            if not unc_ok:
                reasons.append(
                    f"Portion ambiguity must disclose uncertaintyReason/Note and cap confidence <= {max_conf}"
                )

        # 5. Multilingual transcription WER + script + Tanglish numeral fidelity
        reference_transcript = input_payload.get("reference_transcript")
        actual_transcript = str(candidate.get("transcript", ""))
        wer: float | None = None
        if reference_transcript is not None:
            wer = compute_word_error_rate(str(reference_transcript), actual_transcript)
            max_wer = float(input_payload.get("max_wer", 0.25))
            sub_scores.append(round(max(0.0, 1.0 - wer), 4))
            if wer > max_wer:
                reasons.append(f"Transcription WER {wer} exceeded limit {max_wer}")

        if "detectedLanguage" in candidate or input_payload.get("expected_entities"):
            lang_res = self._multilingual.evaluate(
                actual_transcript=actual_transcript,
                detected_language=str(candidate.get("detectedLanguage", expected_language)),
                expected_language=expected_language,
                expected_entities=input_payload.get("expected_entities"),
            )
            sub_scores.append(lang_res.score)
            if not lang_res.passed:
                reasons.extend(lang_res.failure_reasons)

        if "expected_tanglish_quantity" in input_payload:
            exp_qty = int(input_payload["expected_tanglish_quantity"])
            parsed_qty = extract_tanglish_quantity(
                actual_transcript or str(input_payload.get("transcript", ""))
            )
            if parsed_qty != exp_qty:
                reasons.append(f"Tanglish quantity mismatch: expected {exp_qty}, got {parsed_qty}")
                sub_scores.append(0.0)
            else:
                sub_scores.append(1.0)

        # 6. Safety / forbidden term check
        combined_text = (
            f"{candidate.get('summary', '')} {candidate.get('unclearReason', '')} {actual_transcript}"
        ).strip()
        if combined_text:
            s_res = self._safety.evaluate(combined_text, forbidden_terms=forbidden_terms)
            if not s_res.passed:
                reasons.extend(s_res.failure_reasons)
                sub_scores.append(0.0)

        passed = len(reasons) == 0
        avg_score = round(sum(sub_scores) / max(1, len(sub_scores)), 3)
        if not passed:
            avg_score = min(avg_score, round(max(0.0, 1.0 - 0.2 * len(reasons)), 3))

        return EvaluationMetricResult(
            metric_name="multimodal_advanced",
            passed=passed,
            score=avg_score,
            details={"food_f1": round(food_f1, 4), "wer": wer},
            failure_reasons=reasons,
            failure_classification="none" if passed else "multimodal_failure",
        )
