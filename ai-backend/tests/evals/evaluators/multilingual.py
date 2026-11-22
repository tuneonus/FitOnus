"""Multilingual accuracy evaluator for Tamil, English, and Tanglish.

Handles:
- Tamil Unicode script detection
- Tanglish phonetic normalization (e.g. dosai -> dosa, thosai -> dosa)
- Regional numeral and quantity word extraction (oru -> 1, rendu -> 2, etc.)
- Language identification matching
"""

import re
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from tests.evals.schemas import EvaluationMetricResult

# Phonetic normalization mappings for Tanglish food transliterations
TANGLISH_PHONETIC_MAP = {
    r"\bdosai\b": "dosa",
    r"\bthosai\b": "dosa",
    r"\bidly\b": "idli",
    r"\bvadai\b": "vada",
    r"\bmedhu vadai\b": "medu vada",
    r"\bchappathi\b": "chapati",
    r"\bchappati\b": "chapati",
    r"\bdaal\b": "dal",
    r"\bmuttay\b": "egg",
    r"\bmuttai\b": "egg",
}

# Quantity words in Tanglish
TANGLISH_NUMBERS = {
    r"\bonnu\b": 1,
    r"\boru\b": 1,
    r"\brendu\b": 2,
    r"\bmoonu\b": 3,
    r"\bnaalu\b": 4,
    r"\banju\b": 5,
}

# Tamil script Unicode block
_RE_TAMIL_SCRIPT = re.compile(r"[\u0B80-\u0BFF]")


def normalize_tanglish(text: str) -> str:
    """Normalize common Tanglish spelling variants to standard food terms."""
    normalized = text.lower()
    for pattern, target in TANGLISH_PHONETIC_MAP.items():
        normalized = re.sub(pattern, target, normalized)
    return normalized


def extract_tanglish_quantity(text: str) -> int | None:
    """Extract numeric count from Tanglish quantity words."""
    lower = text.lower()
    for pattern, count in TANGLISH_NUMBERS.items():
        if re.search(pattern, lower):
            return count
    return None


def is_tamil_script(text: str) -> bool:
    """Detect if string contains Tamil Unicode script characters."""
    return bool(_RE_TAMIL_SCRIPT.search(text))


class MultilingualAccuracyEvaluator:
    """Evaluates multilingual transcription, dialect classification, and entity preservation."""

    def evaluate(
        self,
        actual_transcript: str,
        detected_language: str,
        expected_language: str,
        expected_entities: list[str] | None = None,
    ) -> EvaluationMetricResult:
        reasons: list[str] = []
        checks = 0
        passed = 0

        # 1. Language classification check
        checks += 1
        if detected_language.lower() == expected_language.lower():
            passed += 1
        else:
            reasons.append(
                f"Language mismatch: expected '{expected_language}', got '{detected_language}'"
            )

        # 2. Script consistency check
        if expected_language.lower() == "ta":
            checks += 1
            if is_tamil_script(actual_transcript):
                passed += 1
            else:
                reasons.append("Expected Tamil script characters in transcript, but none found")

        # 3. Entity preservation check
        normalized_transcript = normalize_tanglish(actual_transcript)
        if expected_entities:
            for entity in expected_entities:
                checks += 1
                norm_ent = normalize_tanglish(entity)
                if norm_ent in normalized_transcript:
                    passed += 1
                else:
                    reasons.append(f"Expected food entity '{entity}' not preserved in transcript")

        score = passed / max(checks, 1)

        return EvaluationMetricResult(
            metric_name="multilingual_accuracy",
            passed=(len(reasons) == 0),
            score=round(score, 3),
            details={
                "detected_language": detected_language,
                "expected_language": expected_language,
                "normalized_transcript": normalized_transcript,
            },
            failure_reasons=reasons,
        )
