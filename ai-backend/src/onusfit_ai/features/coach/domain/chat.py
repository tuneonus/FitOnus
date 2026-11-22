"""Contract for POST /internal/v1/ai/coach/chat.

Mirrors the existing Node types in backend/src/modules/coach/domain/coach.types.ts
(UserFitnessContext, ChatMessageTurn, CoachResponse). Field names are copied, not invented.
Node prepares everything here (context, history, memories) from its own database; this service
never reads a database and never receives a user id in the body (identity is in the service token).
"""

from typing import Annotated, Any, Literal

from pydantic import AfterValidator, Field

from onusfit_ai.shared.contracts._base import ContractModel
from onusfit_ai.shared.contracts.common import ModelSelection, Usage
from onusfit_ai.shared.utils.text import clean_text

# All domain contracts inherit from ContractModel (extra='forbid') to prevent silent contract
# drift between Node.js and Python. Unknown attributes are rejected at request validation time.

# Node limits a stored memory to 1000 characters: same bound here, but cut instead of rejected.
MAX_MEMORY_LENGTH = 1000


def _one_line(value: str) -> str:
    return clean_text(value)


def _one_line_memory(value: str) -> str:
    return clean_text(value, MAX_MEMORY_LENGTH)


# Values a member typed or the app stored (a name, a goal, a memory) end up as one `- label: value`
# line of the prompt. A newline in them could start a fake "CRITICAL RULES:" section, so they are
# flattened to one line here, like the meals feature does. Normal values come out unchanged, so the
# golden prompts are identical. NOT applied to the chat message or the history: multi-line text is
# normal there.
OneLine = Annotated[str, AfterValidator(_one_line)]
Memory = Annotated[str, AfterValidator(_one_line_memory)]


class UserFitnessProfile(ContractModel):
    display_name: OneLine = Field(max_length=200)
    sex: OneLine | None = None
    age: float | None = None
    height_cm: float | None = None
    current_weight_kg: float | None = None
    target_weight_kg: float | None = None
    primary_goal: OneLine | None = Field(default=None, max_length=500)
    experience_level: OneLine | None = Field(default=None, max_length=100)
    preferred_workout_place: OneLine | None = Field(default=None, max_length=100)
    workout_days_per_week: float | None = None
    diet_type: OneLine | None = Field(default=None, max_length=100)
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
    name: OneLine = Field(max_length=300)
    duration_minutes: float
    volume_kg: float
    total_sets: float
    calories_burned: float | None = None
    completed_at: str


class PlannedWorkoutContext(ContractModel):
    name: OneLine = Field(max_length=300)
    duration_minutes: float
    exercises_count: float


class ActiveGoalContext(ContractModel):
    title: OneLine = Field(max_length=300)
    category: OneLine = Field(max_length=100)
    target_value: float
    current_value: float
    unit: OneLine = Field(max_length=50)


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


class KnowledgeContextItem(ContractModel):
    document_slug: str = Field(max_length=120)
    document_title: str = Field(max_length=255)
    category: str = Field(max_length=50)
    chunk_index: int = Field(ge=0)
    content: str = Field(max_length=8000)
    citation: str = Field(max_length=255)


class CitationReference(ContractModel):
    document_slug: str
    document_title: str
    category: str | None = None
    chunk_index: int | None = None
    citation: str


class CoachChatRequest(ContractModel):
    message: str = Field(min_length=1, max_length=1000)
    context: UserFitnessContext
    history: list[ChatTurn] = Field(default_factory=list, max_length=20)
    memories: list[Memory] = Field(default_factory=list, max_length=30)
    knowledge: list[KnowledgeContextItem] = Field(default_factory=list, max_length=10)
    model: ModelSelection
    # Total time budget (primary + fallback model) chosen by Node.
    deadline_ms: int = Field(ge=1000, le=30000)


class CoachChatResult(ContractModel):
    text: str
    follow_ups: list[str]
    sources: list[str]
    medical_note: bool | None = None
    # Kept so the Node/mobile contract does not change, but always None from this service: the model
    # is not asked for blocks and the parser ignores any it invents (see application/parsing.py).
    blocks: list[dict[str, Any]] | None = None
    tool_calls: list[str] | None = None
    citations: list[CitationReference] | None = None


class CoachChatResponse(ContractModel):
    # "ok": the model returned the expected JSON. "unstructured": it did not, so the raw text was
    # returned (this is what Node does today too; the flag makes the silent failure visible).
    outcome: Literal["ok", "unstructured"]
    result: CoachChatResult
    usage: Usage
    trace_id: str
