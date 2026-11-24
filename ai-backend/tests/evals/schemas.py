"""Pydantic schemas for OnusFit AI Golden Evaluation Datasets and Benchmark Results."""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class NutritionMacroTolerance(BaseModel):
    """Ground truth nutrient targets with physiological tolerance percentages."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(description="Standard food name")
    serving_weight_g: float = Field(ge=0, description="Reference serving weight in grams")
    serving_unit: str = Field(description="piece, bowl, cup, slice, etc.")
    serving_size: float = Field(default=1.0, gt=0, description="Portion count")
    calories: float = Field(ge=0, description="Reference energy in kcal")
    protein_g: float = Field(ge=0, description="Reference protein in grams")
    carbs_g: float = Field(ge=0, description="Reference carbohydrates in grams")
    fat_g: float = Field(ge=0, description="Reference fat in grams")
    fiber_g: float | None = Field(default=None, ge=0, description="Reference fiber in grams")

    # Tolerances as relative fractional percentages: 0.10 = +/- 10%
    calorie_tolerance_pct: float = Field(default=0.10, ge=0.0, le=0.50)
    macro_tolerance_pct: float = Field(default=0.15, ge=0.0, le=0.50)
    weight_tolerance_pct: float = Field(default=0.20, ge=0.0, le=0.50)


class ExpectedToolCall(BaseModel):
    """Specification for an expected Gemini function call."""

    model_config = ConfigDict(extra="forbid")

    tool_name: str = Field(description="Expected tool name, e.g. get_recent_workouts")
    arguments: dict[str, Any] = Field(
        default_factory=dict, description="Expected arguments or subset"
    )
    forbidden_arguments: list[str] = Field(
        default_factory=lambda: ["userId", "targetUserId", "user_id"],
        description="Arguments that must NEVER be emitted by the model",
    )


class BenchmarkCase(BaseModel):
    """Canonical schema for every OnusFit AI benchmark test case."""

    model_config = ConfigDict(extra="forbid")

    case_id: str = Field(pattern=r"^[A-Z0-9_\-]+$", description="Unique identifier e.g. COACH_001")
    category: Literal[
        "coach_chat",
        "coach_insights",
        "meal_photo",
        "voice_meal",
        "speech_transcribe",
        "function_calling",
        "fitness_safety",
        "multilingual_dialect",
        "memory_extraction",
        "context_engineering",
    ]
    description: str = Field(description="Summary of test intent")
    language: Literal["en", "ta", "tanglish", "mixed"] = "en"
    input_payload: dict[str, Any] = Field(description="Input arguments passed to feature or prompt")

    # Evaluation targets
    expected_outcome: str = Field(default="ok", description="ok, no_food, refusal, fallback, etc.")
    expected_tools: list[ExpectedToolCall] = Field(
        default_factory=list, description="Expected tool calls (empty if none)"
    )
    expected_nutrition: list[NutritionMacroTolerance] = Field(
        default_factory=list, description="Expected nutritional tolerances"
    )
    expected_safety_disclaimers: list[str] = Field(
        default_factory=list,
        description="Keywords/phrases required in response for safety escalation",
    )
    forbidden_terms: list[str] = Field(
        default_factory=list,
        description="Terms that must NOT appear in output (e.g. dangerous advice)",
    )
    ground_truth_source: str = Field(
        description="Reference source: IFCT 2017, USDA, ACSM, clinical guideline, or synthetic/illustrative"
    )
    is_verified_ground_truth: bool = Field(
        default=False,
        description="True only if derived from authoritative lab/clinical database; False if synthetic",
    )
    offline_candidate: dict[str, Any] | None = Field(
        default=None,
        description="Deterministic candidate output evaluated by the offline regression test harness",
    )


class EvaluationMetricResult(BaseModel):
    """Result emitted by an evaluator for a single metric."""

    model_config = ConfigDict(extra="forbid")

    metric_name: str
    passed: bool
    score: float = Field(ge=0.0, le=1.0, description="Normalized score between 0.0 and 1.0")
    details: dict[str, Any] = Field(default_factory=dict)
    failure_reasons: list[str] = Field(default_factory=list)


class CaseEvaluationReport(BaseModel):
    """Complete evaluation report for a single benchmark case."""

    model_config = ConfigDict(extra="forbid")

    case_id: str
    category: str
    passed: bool
    metrics: list[EvaluationMetricResult] = Field(default_factory=list)
    execution_time_ms: float = 0.0
