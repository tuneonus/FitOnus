"""Typed domain contracts for FitOnus Phase 09 AI Agent Fundamentals.

Framework-independent contracts defining goals, execution states, task plans,
steps, observations, execution limits, and termination reasons.
Keeps Python execution completely stateless between requests.
"""

import time
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from onusfit_ai.features.coach.domain.chat import CoachChatResult
from onusfit_ai.shared.contracts.common import Usage


class ToolExecutionResult(BaseModel):
    """Result of a tool execution recorded by the agent."""

    model_config = ConfigDict(extra="forbid")

    tool_name: str
    args: dict[str, Any]
    result: dict[str, Any]


class AgentGoalType(StrEnum):
    """Supported high-level user goal archetypes."""

    FITNESS_PROGRESS = "fitness_progress"
    WORKOUT_ANALYSIS = "workout_analysis"
    NUTRITION_ANALYSIS = "nutrition_analysis"
    WEIGHT_TREND = "weight_trend"
    EXERCISE_SEARCH = "search_exercises"
    COMBINED_RECOMMENDATIONS = "combined_recommendations"
    SIMPLE_QA = "simple_qa"
    GREETING = "greeting"


class AgentGoal(BaseModel):
    """Structured interpretation of the user's intent and target execution requirements."""

    model_config = ConfigDict(extra="forbid")

    goal_type: AgentGoalType
    target_description: str
    language: Literal["en", "ta", "tanglish"]
    requires_agent_execution: bool
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    target_domains: list[str] = Field(default_factory=list)


class StepStatus(StrEnum):
    """Lifecycle status of an individual execution plan step."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class StepAction(BaseModel):
    """A bounded tool action to be dispatched by the agent."""

    model_config = ConfigDict(extra="forbid")

    tool_name: str
    args: dict[str, Any] = Field(default_factory=dict)
    rationale: str


class ToolObservation(BaseModel):
    """Structured outcome observed from a tool execution."""

    model_config = ConfigDict(extra="forbid")

    step_id: int
    tool_name: str
    args: dict[str, Any]
    raw_result: dict[str, Any]
    summary: str
    is_empty: bool = False
    has_error: bool = False
    error_message: str | None = None
    extracted_entities: dict[str, Any] = Field(default_factory=dict)


class PlanStep(BaseModel):
    """Discrete step within a task plan."""

    model_config = ConfigDict(extra="forbid")

    step_id: int
    description: str
    action: StepAction
    status: StepStatus = StepStatus.PENDING
    observation: ToolObservation | None = None
    error: str | None = None


class TaskPlan(BaseModel):
    """Ordered collection of execution steps designed to fulfill an AgentGoal."""

    model_config = ConfigDict(extra="forbid")

    goal: AgentGoal
    steps: list[PlanStep] = Field(default_factory=list)
    estimated_iterations: int = 1


class ObservationEvaluation(BaseModel):
    """Evaluation of tool observations against the agent goal."""

    model_config = ConfigDict(extra="forbid")

    goal_satisfied: bool
    needs_replanning: bool
    replan_reason: str | None = None
    missing_data_domains: list[str] = Field(default_factory=list)
    new_steps: list[PlanStep] = Field(default_factory=list)


class AgentBudgetConfig(BaseModel):
    """Configurable execution constraints and safety boundaries."""

    model_config = ConfigDict(extra="forbid")

    max_planning_steps: int = Field(default=4, ge=1, le=10)
    max_iterations: int = Field(default=3, ge=1, le=10)
    max_replanning_attempts: int = Field(default=1, ge=0, le=3)
    max_tool_calls: int = Field(default=5, ge=1, le=10)
    max_total_tokens: int = Field(default=4000, ge=500, le=32000)
    deadline_margin_s: float = Field(default=2.0, ge=0.5, le=10.0)


class AgentExecutionStatus(StrEnum):
    """Overall status of the agent lifecycle."""

    IDLE = "idle"
    PLANNING = "planning"
    EXECUTING = "executing"
    OBSERVING = "observing"
    REPLANNING = "replanning"
    SYNTHESIZING = "synthesizing"
    COMPLETED = "completed"
    BUDGET_EXCEEDED = "budget_exceeded"
    DEADLINE_EXCEEDED = "deadline_exceeded"
    FAILED = "failed"
    BYPASSED = "bypassed"


class AgentTerminationReason(StrEnum):
    """Explicit rationale for terminating the agent loop."""

    GOAL_SATISFIED = "goal_satisfied"
    ALL_STEPS_COMPLETED = "all_steps_completed"
    SIMPLE_QUERY_BYPASS = "simple_query_bypass"
    MAX_ITERATIONS_REACHED = "max_iterations_reached"
    MAX_TOOL_CALLS_REACHED = "max_tool_calls_reached"
    MAX_REPLANS_REACHED = "max_replans_reached"
    DEADLINE_APPROACHING = "deadline_approaching"
    TOKEN_BUDGET_EXCEEDED = "token_budget_exceeded"
    SAFETY_RESTRICTION = "safety_restriction"
    UNEXPECTED_ERROR = "unexpected_error"


class AgentState(BaseModel):
    """In-memory execution state for a single request (stateless between requests)."""

    model_config = ConfigDict(extra="forbid")

    trace_id: str
    user_id: str
    goal: AgentGoal
    plan: TaskPlan | None = None
    iteration: int = 0
    replans_count: int = 0
    steps: list[PlanStep] = Field(default_factory=list)
    observations: list[ToolObservation] = Field(default_factory=list)
    executed_tools: list[str] = Field(default_factory=list)  # serialized tool_name:args
    status: AgentExecutionStatus = AgentExecutionStatus.IDLE
    termination_reason: AgentTerminationReason | None = None
    total_tool_calls: int = 0
    accumulated_tokens: int = 0
    start_time: float = Field(default_factory=time.monotonic)


class AgentExecutionResult(BaseModel):
    """Final output envelope returned after agent execution completes."""

    model_config = ConfigDict(extra="forbid")

    response: CoachChatResult
    status: AgentExecutionStatus
    termination_reason: AgentTerminationReason
    goal: AgentGoal
    executed_steps: list[PlanStep]
    observations: list[ToolObservation]
    tool_calls: list[ToolExecutionResult] = Field(default_factory=list)
    usage: Usage | None = None
    iterations: int = 0
    replans: int = 0
