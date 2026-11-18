"""Contract for POST /internal/v1/ai/coach/chat.

Mirrors the existing Node types in backend/src/modules/coach/domain/coach.types.ts
(UserFitnessContext, ChatMessageTurn, CoachResponse). Field names are copied, not invented.
Node prepares everything here (context, history, memories) from its own database; this service
never reads a database and never receives a user id in the body (identity is in the service token).
"""

from typing import Annotated, Any, Literal

from pydantic import Field, StringConstraints

from onusfit_ai.contracts._base import ContractModel

ModelName = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9._-]{1,64}$")]


class UserFitnessProfile(ContractModel):
    display_name: str = Field(max_length=200)
    sex: str | None = None
    age: float | None = None
    height_cm: float | None = None
    current_weight_kg: float | None = None
    target_weight_kg: float | None = None
    primary_goal: str | None = Field(default=None, max_length=500)
    experience_level: str | None = Field(default=None, max_length=100)
    preferred_workout_place: str | None = Field(default=None, max_length=100)
    workout_days_per_week: float | None = None
    diet_type: str | None = Field(default=None, max_length=100)
    daily_calorie_target: float | None = None
    daily_protein_grams: float | None = None


class TodayNutritionContext(ContractModel):
    calories_consumed: float
    protein_grams: float
    carbs_grams: float
    fat_grams: float
    water_intake_ml: float
    calorie_target: float | None = None
    protein_target: float | None = None


class RecentWorkoutContext(ContractModel):
    name: str = Field(max_length=300)
    duration_minutes: float
    volume_kg: float
    total_sets: float
    calories_burned: float | None = None
    completed_at: str


class PlannedWorkoutContext(ContractModel):
    name: str = Field(max_length=300)
    duration_minutes: float
    exercises_count: float


class ActiveGoalContext(ContractModel):
    title: str = Field(max_length=300)
    category: str = Field(max_length=100)
    target_value: float
    current_value: float
    unit: str = Field(max_length=50)


class UserFitnessContext(ContractModel):
    profile: UserFitnessProfile
    today_nutrition: TodayNutritionContext
    recent_workouts: list[RecentWorkoutContext] = Field(max_length=50)
    today_planned_workout: PlannedWorkoutContext | None = None
    active_goals: list[ActiveGoalContext] = Field(max_length=50)
    latest_weight_kg: float | None = None


class ChatTurn(ContractModel):
    role: Literal["user", "assistant"]
    # Server-stored assistant replies can be long: looser than the 1000-char client limit.
    text: str = Field(max_length=8000)


class ModelSelection(ContractModel):
    """Chosen by Node from the admin console's Gemini configuration; Python does not read the DB."""

    primary: ModelName
    fallback: ModelName | None = None


class CoachChatRequest(ContractModel):
    message: str = Field(min_length=1, max_length=1000)
    context: UserFitnessContext
    history: list[ChatTurn] = Field(default_factory=list, max_length=20)
    memories: list[str] = Field(default_factory=list, max_length=30)
    model: ModelSelection
    # Total time budget (primary + fallback model) chosen by Node.
    deadline_ms: int = Field(ge=1000, le=30000)


class CoachChatResult(ContractModel):
    text: str
    follow_ups: list[str]
    sources: list[str]
    medical_note: bool | None = None
    blocks: list[dict[str, Any]] | None = None


class Usage(ContractModel):
    model: str
    is_fallback: bool
    input_tokens: int
    output_tokens: int
    cached_tokens: int
    thinking_tokens: int
    total_tokens: int
    duration_ms: int


class CoachChatResponse(ContractModel):
    # "ok": the model returned the expected JSON. "unstructured": it did not, so the raw text was
    # returned (this is what Node does today too; the flag makes the silent failure visible).
    outcome: Literal["ok", "unstructured"]
    result: CoachChatResult
    usage: Usage
    trace_id: str
