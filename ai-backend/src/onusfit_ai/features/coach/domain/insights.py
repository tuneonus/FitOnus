"""Contract for POST /internal/v1/ai/coach/insights.

Mirrors the existing Node types (`UserFitnessContext`, `CoachInsightItem` and
`CoachInsightsResponse` in backend/src/modules/coach/domain/coach.types.ts). Node has already
authenticated the user, checked the quota, served or missed its cache, loaded the user's data and
picked the models; this service only turns the context into insights. The context is the same
complete payload coach chat receives.

Python never fabricates insights: when the model's reply is unusable it says so (`outcome:
"unusable"`, no result) and Node builds its own deterministic, data-backed insights.
"""

from typing import Literal

from pydantic import Field

from onusfit_ai.features.coach.domain.chat import UserFitnessContext
from onusfit_ai.shared.contracts._base import ContractModel
from onusfit_ai.shared.contracts.common import ModelSelection, Usage


class CoachInsightsRequest(ContractModel):
    context: UserFitnessContext
    # The public API only allows "en", "ta" and "tanglish"; anything else is treated as English.
    lang: str | None = Field(default=None, max_length=50)
    model: ModelSelection
    # Total time budget (primary + fallback model) chosen by Node.
    deadline_ms: int = Field(ge=1000, le=30000)


class InsightItem(ContractModel):
    id: str
    title: str
    description: str
    category: Literal["workout", "nutrition", "hydration", "goal", "recovery"]
    priority: Literal["high", "medium", "low"]
    severity: Literal["positive", "watch", "info"]
    action: str
    question: str
    evidence: list[str]
    confidence: Literal["high", "medium", "low"]
    requires_device: bool


class InsightsResult(ContractModel):
    greeting: str
    recommendation: str | None = None
    insights: list[InsightItem]
    generated_at: str
    has_sufficient_data: bool


class CoachInsightsResponse(ContractModel):
    # "ok": the model returned at least one insight. "unusable": it did not (not JSON, no insights,
    # a broken item); `result` is then null and Node falls back to deterministic insights.
    outcome: Literal["ok", "unusable"]
    result: InsightsResult | None = None
    usage: Usage
    trace_id: str
