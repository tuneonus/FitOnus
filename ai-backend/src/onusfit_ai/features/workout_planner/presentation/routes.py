"""FastAPI endpoints for AI Workout Planning subsystem."""

import uuid

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, ConfigDict, Field

from onusfit_ai.features.workout_planner.application.generator import WorkoutPlanGenerator
from onusfit_ai.features.workout_planner.application.graph.executor import (
    WorkoutPlannerGraphExecutor,
)
from onusfit_ai.features.workout_planner.domain.contracts import (
    PlanValidationResult,
    WeeklyWorkoutSchedule,
    WorkoutAdaptationRequest,
    WorkoutGenerationRequest,
)
from onusfit_ai.features.workout_planner.domain.safety import validate_plan_safety
from onusfit_ai.shared.auth import ServiceClaims, require_scope
from onusfit_ai.shared.llm.dependencies import get_llm
from onusfit_ai.shared.llm.ports import TextGenerator
from onusfit_ai.shared.tools import InternalToolsClient, get_tools_client

SCOPE = "ai:workout:plan"
require_workout_plan_scope = require_scope(SCOPE)

router = APIRouter(prefix="/internal/v1/ai/workout-planner", tags=["workout-planner"])


class GenerateWorkoutPlanResponse(BaseModel):
    """Response envelope for workout plan generation."""

    model_config = ConfigDict(extra="forbid")

    plan: WeeklyWorkoutSchedule = Field(description="Generated weekly workout plan")
    validation: PlanValidationResult = Field(description="Safety validation details")
    trace_id: str = Field(description="Distributed trace identifier")


class AdaptWorkoutPlanResponse(BaseModel):
    """Response envelope for workout plan adaptation."""

    model_config = ConfigDict(extra="forbid")

    plan: WeeklyWorkoutSchedule = Field(description="Adapted weekly workout plan")
    validation: PlanValidationResult = Field(description="Safety validation details")
    trace_id: str = Field(description="Distributed trace identifier")


class ValidateWorkoutPlanPayload(BaseModel):
    """Request payload for validating a workout plan."""

    model_config = ConfigDict(extra="forbid")

    plan: WeeklyWorkoutSchedule
    request: WorkoutGenerationRequest


@router.post("/generate", response_model=GenerateWorkoutPlanResponse)
async def generate_workout_plan_endpoint(
    body: WorkoutGenerationRequest,
    claims: ServiceClaims = Depends(require_workout_plan_scope),
    llm: TextGenerator = Depends(get_llm),
    tools_client: InternalToolsClient = Depends(get_tools_client),
    x_request_id: str | None = Header(default=None),
) -> GenerateWorkoutPlanResponse:
    """Generate a personalized AI workout plan using LangGraph and Gemini structured outputs."""
    trace_id = x_request_id or claims.request_id or str(uuid.uuid4())

    # User identity bound exclusively from verified JWT claims
    bound_request = body.model_copy(update={"user_id": claims.user_id})

    executor = WorkoutPlannerGraphExecutor(
        llm=llm,
        tools_client=tools_client,
    )
    plan, val_result = await executor.execute(
        request=bound_request,
        trace_id=trace_id,
    )

    return GenerateWorkoutPlanResponse(
        plan=plan,
        validation=val_result,
        trace_id=trace_id,
    )


@router.post("/adapt", response_model=AdaptWorkoutPlanResponse)
async def adapt_workout_plan_endpoint(
    body: WorkoutAdaptationRequest,
    claims: ServiceClaims = Depends(require_workout_plan_scope),
    llm: TextGenerator = Depends(get_llm),
    x_request_id: str | None = Header(default=None),
) -> AdaptWorkoutPlanResponse:
    """Adapt an existing workout plan based on missed days, time cuts, or difficulty feedback."""
    trace_id = x_request_id or claims.request_id or str(uuid.uuid4())

    # User identity bound exclusively from verified JWT claims
    bound_request = body.model_copy(update={"user_id": claims.user_id})

    generator = WorkoutPlanGenerator()
    plan, val_result = generator.adapt_workout_plan(
        request=bound_request,
        llm=llm,
    )

    return AdaptWorkoutPlanResponse(
        plan=plan,
        validation=val_result,
        trace_id=trace_id,
    )


@router.post("/validate", response_model=PlanValidationResult)
async def validate_workout_plan_endpoint(
    body: ValidateWorkoutPlanPayload,
    claims: ServiceClaims = Depends(require_workout_plan_scope),
) -> PlanValidationResult:
    """Deterministically validate a workout plan without calling Gemini."""
    # Ensure user ID consistency
    bound_request = body.request.model_copy(update={"user_id": claims.user_id})
    generator = WorkoutPlanGenerator()
    valid_ids = generator.catalog_index.get_all_ids()

    return validate_plan_safety(
        plan=body.plan,
        request=bound_request,
        valid_catalog_ids=valid_ids,
    )
