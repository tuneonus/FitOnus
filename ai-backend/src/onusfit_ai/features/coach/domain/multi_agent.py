"""Typed domain contracts and ports for FitOnus Phase 13 Multi-Agent Systems.

Follows Hexagonal / Clean Architecture:
- Zero LangGraph, FastAPI, Gemini SDK, or MCP SDK imports.
- Reuses existing Coach domain contracts (`CoachChatResult`, `Usage`) and defines
  clean structural Protocols to coordinate `A2AMediator`, `WorkoutPlanner`, and MCP tools.
"""

import time
from enum import StrEnum
from typing import Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field

from onusfit_ai.features.coach.domain.chat import CoachChatResult
from onusfit_ai.shared.contracts.common import Usage


class AgentRole(StrEnum):
    """Canonical specialized agent roles in the FitOnus fitness ecosystem."""

    SUPERVISOR = "supervisor"
    WORKOUT = "workout"
    NUTRITION = "nutrition"
    PROGRESS = "progress"
    RECOVERY = "recovery"
    KNOWLEDGE = "knowledge"


class AgentCapability(StrEnum):
    """Discoverable capabilities exposed by agents for routing and authorization."""

    INTENT_ROUTING = "intent_routing"
    RESPONSE_SYNTHESIS = "response_synthesis"
    WORKOUT_PLANNING = "workout_planning"
    WORKOUT_ADAPTATION = "workout_adaptation"
    WORKOUT_VALIDATION = "workout_validation"
    WORKOUT_HISTORY = "workout_history"
    EXERCISE_CATALOG = "exercise_catalog"
    NUTRITION_ANALYSIS = "nutrition_analysis"
    NUTRITION_PLANNING = "nutrition_planning"
    PROGRESS_TRACKING = "progress_tracking"
    WEIGHT_ANALYSIS = "weight_analysis"
    RECOVERY_GUIDANCE = "recovery_guidance"
    KNOWLEDGE_RETRIEVAL = "knowledge_retrieval"


class OrchestrationMode(StrEnum):
    """Execution strategy selected by the Supervisor router."""

    BYPASS = "bypass"
    SINGLE_AGENT = "single_agent"
    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"
    HYBRID = "hybrid"


class DelegatedTaskStatus(StrEnum):
    """Lifecycle status of a task delegated to a specialist agent."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    PARTIAL = "partial"
    REFUSED = "refused"
    FAILED = "failed"
    CANCELLED = "cancelled"
    SKIPPED = "skipped"


class MultiAgentWorkflowStatus(StrEnum):
    """Overall status of the multi-agent supervisor workflow."""

    IDLE = "idle"
    ROUTING = "routing"
    DELEGATING = "delegating"
    EXECUTING = "executing"
    AGGREGATING = "aggregating"
    VALIDATING = "validating"
    REPLANNING = "replanning"
    SYNTHESIZING = "synthesizing"
    COMPLETED = "completed"
    PARTIAL = "partial"
    BYPASSED = "bypassed"
    BUDGET_EXCEEDED = "budget_exceeded"
    DEADLINE_EXCEEDED = "deadline_exceeded"
    CANCELLED = "cancelled"
    FAILED = "failed"


class MultiAgentTerminationReason(StrEnum):
    """Explicit reason why the multi-agent workflow terminated."""

    GOAL_SATISFIED = "goal_satisfied"
    PARTIAL_RESULTS_RETURNED = "partial_results_returned"
    SIMPLE_QUERY_BYPASS = "simple_query_bypass"
    MEDICAL_RED_FLAG_HALT = "medical_red_flag_halt"
    MAX_AGENT_INVOCATIONS_REACHED = "max_agent_invocations_reached"
    MAX_LLM_CALLS_REACHED = "max_llm_calls_reached"
    TOKEN_BUDGET_EXCEEDED = "token_budget_exceeded"
    MAX_TOOL_CALLS_REACHED = "max_tool_calls_reached"
    MAX_DELEGATION_DEPTH_REACHED = "max_delegation_depth_reached"
    CIRCULAR_DELEGATION_BLOCKED = "circular_delegation_blocked"
    MAX_REPLANS_REACHED = "max_replans_reached"
    DEADLINE_APPROACHING = "deadline_approaching"
    CANCELLED = "cancelled"
    NATIVE_FALLBACK_USED = "native_fallback_used"
    UNEXPECTED_ERROR = "unexpected_error"


class AgentDescriptor(BaseModel):
    """Identity, capabilities, tool permissions, and cost metadata of an agent."""

    model_config = ConfigDict(extra="forbid")

    agent_id: str
    role: AgentRole
    name: str
    description: str
    capabilities: list[AgentCapability] = Field(default_factory=list)
    allowed_tools: list[str] = Field(default_factory=list)
    supports_parallel: bool = True
    available: bool = True
    estimated_cost_units: int = Field(default=1, ge=0)
    requires_llm: bool = False


class TaskDependency(BaseModel):
    """Directed dependency edge between delegated tasks."""

    model_config = ConfigDict(extra="forbid")

    task_id: str
    depends_on: list[str] = Field(default_factory=list)
    dependency_type: Literal["required", "optional"] = "required"


class DelegatedTask(BaseModel):
    """Structured task delegated from Supervisor to a specialized agent."""

    model_config = ConfigDict(extra="forbid")

    task_id: str
    target_agent: AgentRole
    task_type: str
    instructions: str
    input_data: dict[str, Any] = Field(default_factory=dict)
    constraints: list[str] = Field(default_factory=list)
    required_capabilities: list[AgentCapability] = Field(default_factory=list)
    depends_on: list[str] = Field(default_factory=list)
    dependency_type: Literal["required", "optional"] = "required"
    priority: int = Field(default=1, ge=1, le=10)
    allow_llm: bool = False
    timeout_seconds: float = Field(default=8.0, ge=0.5, le=30.0)
    idempotency_signature: str = ""


class RoutingDecision(BaseModel):
    """Supervisor routing plan specifying mode, selected agents, and tasks."""

    model_config = ConfigDict(extra="forbid")

    mode: OrchestrationMode
    goal_type: str
    language: Literal["en", "ta", "tanglish"] = "en"
    selected_agents: list[AgentRole] = Field(default_factory=list)
    tasks: list[DelegatedTask] = Field(default_factory=list)
    bypass_reason: str | None = None
    rationale: str = ""
    estimated_tool_calls: int = 0
    estimated_llm_calls: int = 0


class EvidenceItem(BaseModel):
    """Verified evidence artifact produced by a specialist agent or tool."""

    model_config = ConfigDict(extra="forbid")

    source_agent: AgentRole
    source_tool: str | None = None
    citation: str | None = None
    summary: str
    metrics: dict[str, Any] = Field(default_factory=dict)
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    is_verified: bool = True


class AgentRecommendation(BaseModel):
    """Actionable domain recommendation emitted by a specialist agent."""

    model_config = ConfigDict(extra="forbid")

    agent_role: AgentRole
    domain: str
    summary: str
    action_items: list[str] = Field(default_factory=list)
    priority: int = Field(default=3, ge=1, le=10)
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    constraints_applied: list[str] = Field(default_factory=list)
    requires_medical_caution: bool = False
    structured_payload: dict[str, Any] = Field(default_factory=dict)


class ContextConflict(BaseModel):
    """Recorded resolution when two specialist recommendations conflict."""

    model_config = ConfigDict(extra="forbid")

    conflict_id: str
    agents_involved: list[AgentRole]
    topic: str
    resolution: str
    winning_agent: AgentRole


class SharedExecutionContext(BaseModel):
    """Request-scoped shared context for multi-agent coordination (never persisted across users)."""

    model_config = ConfigDict(extra="forbid")

    trace_id: str
    request_id: str
    user_id: str
    user_message: str
    language: Literal["en", "ta", "tanglish"] = "en"
    profile_summary: dict[str, Any] = Field(default_factory=dict)
    today_nutrition_summary: dict[str, Any] = Field(default_factory=dict)
    recent_workouts_summary: list[dict[str, Any]] = Field(default_factory=list)
    active_goals_summary: list[dict[str, Any]] = Field(default_factory=list)
    memories: list[str] = Field(default_factory=list)
    memory_consent_granted: bool = False
    knowledge_items: list[dict[str, Any]] = Field(default_factory=list)
    history_turns: list[dict[str, str]] = Field(default_factory=list)
    medical_red_flags: list[str] = Field(default_factory=list)
    physical_limitations: list[str] = Field(default_factory=list)
    available_equipment: list[str] = Field(default_factory=list)
    evidence: list[EvidenceItem] = Field(default_factory=list)
    recommendations: list[AgentRecommendation] = Field(default_factory=list)
    conflicts_resolved: list[ContextConflict] = Field(default_factory=list)


class MinimalAgentContextView(BaseModel):
    """Role-scoped minimal context passed to a single specialist agent."""

    model_config = ConfigDict(extra="forbid")

    trace_id: str
    request_id: str
    user_id: str
    target_role: AgentRole
    language: Literal["en", "ta", "tanglish"] = "en"
    user_message: str
    domain_data: dict[str, Any] = Field(default_factory=dict)
    relevant_memories: list[str] = Field(default_factory=list)
    relevant_knowledge: list[dict[str, Any]] = Field(default_factory=list)
    physical_limitations: list[str] = Field(default_factory=list)
    medical_red_flags: list[str] = Field(default_factory=list)
    upstream_outputs: dict[str, Any] = Field(default_factory=dict)


class AgentMessageEnvelope(BaseModel):
    """Domain-level record of an inter-agent message correlated by task and trace."""

    model_config = ConfigDict(extra="forbid")

    message_id: str
    correlation_id: str
    task_id: str
    sender_agent: str
    recipient_agent: str
    performative: str
    timestamp: float = Field(default_factory=time.time)


class AgentExecutionResultItem(BaseModel):
    """Structured outcome returned by a specialist agent for one delegated task."""

    model_config = ConfigDict(extra="forbid")

    task_id: str
    agent_role: AgentRole
    correlation_id: str
    status: DelegatedTaskStatus
    output_data: dict[str, Any] = Field(default_factory=dict)
    recommendations: list[AgentRecommendation] = Field(default_factory=list)
    evidence: list[EvidenceItem] = Field(default_factory=list)
    tool_calls: list[str] = Field(default_factory=list)
    tokens_used: int = 0
    input_tokens_used: int = 0
    output_tokens_used: int = 0
    llm_calls_used: int = 0
    duration_ms: float = 0.0
    error_message: str | None = None
    partial: bool = False
    deduplicated: bool = False


class MultiAgentExecutionBudget(BaseModel):
    """Cumulative request-level execution budget shared across ALL agents (never multiplied)."""

    model_config = ConfigDict(extra="forbid")

    max_agent_invocations: int = Field(default=6, ge=1, le=20)
    max_llm_calls: int = Field(default=2, ge=1, le=10)
    max_input_tokens: int = Field(default=6000, ge=500, le=32000)
    max_output_tokens: int = Field(default=2000, ge=200, le=16000)
    max_total_tokens: int = Field(default=8000, ge=500, le=40000)
    max_tool_calls: int = Field(default=6, ge=1, le=20)
    max_delegation_depth: int = Field(default=1, ge=1, le=3)
    max_replanning_attempts: int = Field(default=1, ge=0, le=3)
    max_concurrent_agents: int = Field(default=3, ge=1, le=6)
    deadline_seconds: float = Field(default=20.0, ge=1.0, le=60.0)
    deadline_margin_s: float = Field(default=1.5, ge=0.2, le=10.0)


class BudgetUsageSnapshot(BaseModel):
    """Point-in-time cumulative budget consumption across the entire request."""

    model_config = ConfigDict(extra="forbid")

    agent_invocations: int = 0
    llm_calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    tool_calls: int = 0
    replanning_attempts: int = 0
    max_depth_observed: int = 0
    elapsed_ms: float = 0.0
    exhausted_reason: str | None = None


class MultiAgentFinalResult(BaseModel):
    """Final orchestration envelope mapped cleanly onto CoachChatResponse."""

    model_config = ConfigDict(extra="forbid")

    response: CoachChatResult
    status: MultiAgentWorkflowStatus
    termination_reason: MultiAgentTerminationReason
    routing_decision: RoutingDecision
    agent_results: list[AgentExecutionResultItem] = Field(default_factory=list)
    conflicts_resolved: list[ContextConflict] = Field(default_factory=list)
    budget_snapshot: BudgetUsageSnapshot = Field(default_factory=BudgetUsageSnapshot)
    usage: Usage
    replan_attempts: int = 0
    fallback_used: bool = False
    partial_results: bool = False
    executed_tools: list[str] = Field(default_factory=list)


# -----------------------------------------------------------------------------
# Clean Architecture Ports (Dependency Inversion across Feature Boundaries)
# -----------------------------------------------------------------------------
class A2AMediatorProtocol(Protocol):
    """Protocol decoupling multi-agent orchestration from features.mcp.application.a2a."""

    def register_agent(
        self,
        agent_id: str,
        handler: Any,
        *,
        role: str = "",
        description: str = "",
        capabilities: list[str] | None = None,
        available: bool = True,
        supports_parallel: bool = True,
    ) -> None: ...

    def discover_agents(
        self, capability: str | None = None, *, only_available: bool = True
    ) -> list[Any]: ...

    def cancel_conversation(self, conversation_id: str, reason: str = "cancelled") -> None: ...

    def is_cancelled(self, conversation_id: str) -> bool: ...

    async def delegate_task(
        self,
        sender: str,
        recipient: str,
        task: Any,
        conversation_id: str | None = None,
        *,
        max_depth: int = 1,
    ) -> Any: ...

    async def execute_task_dag(
        self,
        specs: list[Any],
        conversation_id: str,
        *,
        max_concurrency: int = 3,
        max_depth: int = 1,
        deadline: float | None = None,
    ) -> list[Any]: ...

    def aggregate_results(self, responses: list[Any]) -> dict[str, Any]: ...


class WorkoutPlannerPort(Protocol):
    """Protocol decoupling WorkoutAgent from features.workout_planner."""

    async def generate_preview_plan(
        self,
        *,
        user_id: str,
        goal: str,
        experience_level: str,
        available_equipment: list[str],
        days_per_week: int,
        session_duration_minutes: int,
        physical_limitations: list[str],
        language: str,
        recent_performance: dict[str, float],
        rag_context: list[str],
    ) -> dict[str, Any]: ...

    async def adapt_preview_plan(
        self,
        *,
        user_id: str,
        current_plan: dict[str, Any],
        feedback: str,
        recovery_score: float | None,
        reduced_duration_minutes: int | None,
        new_equipment: list[str] | None,
        language: str,
    ) -> dict[str, Any]: ...

    def check_medical_red_flags(
        self, limitations: list[str], user_notes: str | None = None
    ) -> list[str]: ...


class McpToolGatewayPort(Protocol):
    """Protocol decoupling agent tool calls from concrete MCP / InternalTools clients."""

    def discover_allowed_tools(self, agent_role: AgentRole) -> list[str]: ...

    async def execute_for_agent(
        self,
        *,
        agent_role: AgentRole,
        agent_capabilities: list[AgentCapability],
        tool_name: str,
        arguments: dict[str, Any],
        user_id: str,
        request_id: str,
    ) -> dict[str, Any]: ...

