"""Conditional edge routing logic for FitOnus LangGraph agent workflows.

FitOnus Phase 10: LangGraph Agent Workflows — Stage 04.
Implements deterministic conditional transitions:
- START -> interpret_goal -> should_bypass -> [task_planning | final_synthesis]
- task_planning -> tool_execution -> observation_processing -> route_after_observation
- route_after_observation -> [replanning | final_synthesis]
- replanning -> tool_execution
- final_synthesis -> END
"""

import logging
from typing import Final, Literal

from onusfit_ai.features.coach.application.agent.graph.state import GraphAgentState
from onusfit_ai.features.coach.domain.agent import (
    AgentExecutionStatus,
)

logger = logging.getLogger("onusfit_ai.agent.graph.routing")

# Destination node constants
NODE_TASK_PLANNING: Final = "task_planning"
NODE_TOOL_EXECUTION: Final = "tool_execution"
NODE_OBSERVATION_PROCESSING: Final = "observation_processing"
NODE_REPLANNING: Final = "replanning"
NODE_FINAL_SYNTHESIS: Final = "final_synthesis"


def should_bypass(
    state: GraphAgentState,
) -> Literal["task_planning", "final_synthesis"]:
    """Determines whether to execute multi-step planning or bypass directly to synthesis.

    Bypasses when:
    - User query is simple QA or pure greeting.
    - Local profile metrics suffice without tool calls.
    - Goal interpretation failed.
    """
    goal = state.get("goal")
    status = state.get("status")

    if status == AgentExecutionStatus.FAILED or not goal:
        logger.info("Routing to final_synthesis due to goal failure or missing goal.")
        return NODE_FINAL_SYNTHESIS

    if not goal.requires_agent_execution:
        logger.info(
            "Simple query bypass detected for goal '%s' (lang=%s). Routing to final_synthesis.",
            goal.goal_type,
            goal.language,
        )
        return NODE_FINAL_SYNTHESIS

    return NODE_TASK_PLANNING


def route_after_observation(
    state: GraphAgentState,
) -> Literal["replanning", "final_synthesis"]:
    """Determines whether to trigger adaptive replanning or proceed to final grounded synthesis.

    Routes to replanning when:
    - Observations revealed empty/missing data requiring window expansion.
    - Replan budget and step count bounds permit additional actions.

    Routes to synthesis when:
    - Goal is satisfied.
    - All planned steps are finished.
    - Deadlines or execution budgets are approaching limit.
    """
    status = state.get("status")
    needs_replanning = state.get("needs_replanning", False)

    # Budget or deadline exhausted -> force synthesis with partial results
    if status in (
        AgentExecutionStatus.DEADLINE_EXCEEDED,
        AgentExecutionStatus.BUDGET_EXCEEDED,
        AgentExecutionStatus.COMPLETED,
        AgentExecutionStatus.FAILED,
    ):
        return NODE_FINAL_SYNTHESIS

    if needs_replanning and status == AgentExecutionStatus.REPLANNING:
        logger.info(
            "Adaptive replanning triggered: %s. Routing to replanning.",
            state.get("replan_reason"),
        )
        return NODE_REPLANNING

    return NODE_FINAL_SYNTHESIS
