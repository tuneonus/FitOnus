"""Multi-agent orchestration package for FitOnus AI Coach."""

from onusfit_ai.features.coach.application.multi_agent.agents import (
    BaseSpecialistAgent,
    KnowledgeAgent,
    NutritionAgent,
    ProgressAgent,
    RecoveryAgent,
    SupervisorAgent,
    WorkoutAgent,
)
from onusfit_ai.features.coach.application.multi_agent.budgets import (
    CumulativeBudgetTracker,
    MultiAgentBudgetExceededError,
)
from onusfit_ai.features.coach.application.multi_agent.context import (
    build_agent_context_view,
    build_shared_execution_context,
    deduplicate_evidence,
    resolve_recommendation_conflicts,
)
from onusfit_ai.features.coach.application.multi_agent.graph.executor import (
    MultiAgentCoachExecutor,
)
from onusfit_ai.features.coach.application.multi_agent.mcp_gateway import (
    MultiAgentMcpGateway,
)
from onusfit_ai.features.coach.application.multi_agent.router import (
    SupervisorRouter,
)
from onusfit_ai.features.coach.application.multi_agent.telemetry import (
    MultiAgentTelemetry,
)

__all__ = [
    "BaseSpecialistAgent",
    "CumulativeBudgetTracker",
    "KnowledgeAgent",
    "MultiAgentBudgetExceededError",
    "MultiAgentCoachExecutor",
    "MultiAgentMcpGateway",
    "NutritionAgent",
    "ProgressAgent",
    "RecoveryAgent",
    "SupervisorAgent",
    "SupervisorRouter",
    "WorkoutAgent",
    "build_agent_context_view",
    "build_shared_execution_context",
    "deduplicate_evidence",
    "resolve_recommendation_conflicts",
    "MultiAgentTelemetry",
]

