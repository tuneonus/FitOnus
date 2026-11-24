"""LangGraph orchestration package for FitOnus AI Coach Agent.

FitOnus Phase 10: LangGraph Agent Workflows.
Provides typed graph state, state reducers, workflow nodes, conditional routing,
and a high-performance, fault-tolerant execution engine with fallback to the native agent.
"""

from onusfit_ai.features.coach.application.agent.graph.builder import (
    build_coach_agent_graph,
    get_compiled_coach_graph,
)
from onusfit_ai.features.coach.application.agent.graph.executor import (
    LangGraphAgentExecutor,
)
from onusfit_ai.features.coach.application.agent.graph.state import (
    GraphAgentState,
    create_initial_graph_state,
)

__all__ = [
    "GraphAgentState",
    "LangGraphAgentExecutor",
    "build_coach_agent_graph",
    "create_initial_graph_state",
    "get_compiled_coach_graph",
]
