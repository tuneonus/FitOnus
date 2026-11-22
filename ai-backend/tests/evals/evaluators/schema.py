"""Deterministic schema conformance evaluator."""

import json
import sys
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ValidationError

_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from tests.evals.schemas import EvaluationMetricResult


class SchemaConformanceEvaluator:
    """Evaluates whether an AI output strictly conforms to a target Pydantic schema."""

    def __init__(self, target_schema: type[BaseModel]) -> None:
        self.target_schema = target_schema

    def evaluate(self, output: Any) -> EvaluationMetricResult:
        reasons: list[str] = []
        parsed_dict: dict[str, Any] | None = None

        if isinstance(output, str):
            try:
                parsed_dict = json.loads(output)
            except Exception as e:
                return EvaluationMetricResult(
                    metric_name="schema_conformance",
                    passed=False,
                    score=0.0,
                    details={"error": "JSON parse error"},
                    failure_reasons=[f"Output is not valid JSON: {e}"],
                )
        elif isinstance(output, dict):
            parsed_dict = output
        elif isinstance(output, self.target_schema):
            return EvaluationMetricResult(
                metric_name="schema_conformance",
                passed=True,
                score=1.0,
                details={"schema": self.target_schema.__name__},
            )
        else:
            return EvaluationMetricResult(
                metric_name="schema_conformance",
                passed=False,
                score=0.0,
                details={"output_type": type(output).__name__},
                failure_reasons=[f"Unsupported output type: {type(output).__name__}"],
            )

        try:
            self.target_schema.model_validate(parsed_dict)
            return EvaluationMetricResult(
                metric_name="schema_conformance",
                passed=True,
                score=1.0,
                details={"schema": self.target_schema.__name__},
            )
        except ValidationError as val_err:
            for err in val_err.errors():
                loc = ".".join(str(p) for p in err["loc"])
                msg = err["msg"]
                reasons.append(f"Field '{loc}': {msg}")

            return EvaluationMetricResult(
                metric_name="schema_conformance",
                passed=False,
                score=0.0,
                details={"error_count": len(reasons)},
                failure_reasons=reasons,
            )
