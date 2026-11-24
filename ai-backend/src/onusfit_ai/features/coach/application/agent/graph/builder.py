"""Graph topology and compilation for FitOnus LangGraph agent workflows.

FitOnus Phase 10: LangGraph Agent Workflows — Stage 04 & 05.
Constructs and compiles the StateGraph workflow connecting:
START -> interpret_goal -> should_bypass -> [task_planning | final_synthesis]
task_planning -> tool_execution -> observation_processing -> route_after_observation
route_after_observation -> [replanning | final_synthesis]
replanning -> tool_execution
final_synthesis -> END
"""

from typing import Any

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from onusfit_ai.features.coach.application.agent.graph.nodes import (
    final_synthesis_node,
    interpret_goal_node,
    observation_processing_node,
    replanning_node,
    task_planning_node,
    tool_execution_node,
)
from onusfit_ai.features.coach.application.agent.graph.routing import (
    NODE_FINAL_SYNTHESIS,
    NODE_OBSERVATION_PROCESSING,
    NODE_REPLANNING,
    NODE_TASK_PLANNING,
    NODE_TOOL_EXECUTION,
    route_after_observation,
    should_bypass,
)
from onusfit_ai.features.coach.application.agent.graph.state import GraphAgentState

NODE_INTERPRET_GOAL = "interpret_goal"

_COMPILED_GRAPH: Any = None


def build_coach_agent_graph(
    checkpointer: BaseCheckpointSaver[Any] | None = None,
) -> Any:
    """Builds and compiles the LangGraph StateGraph workflow for Coach AI Agent."""
    workflow = StateGraph(GraphAgentState)

    # 1. Register Nodes
    workflow.add_node(NODE_INTERPRET_GOAL, interpret_goal_node)
    workflow.add_node(NODE_TASK_PLANNING, task_planning_node)
    workflow.add_node(NODE_TOOL_EXECUTION, tool_execution_node)
    workflow.add_node(NODE_OBSERVATION_PROCESSING, observation_processing_node)
    workflow.add_node(NODE_REPLANNING, replanning_node)
    workflow.add_node(NODE_FINAL_SYNTHESIS, final_synthesis_node)

    # 2. Register Edges
    workflow.add_edge(START, NODE_INTERPRET_GOAL)

    # Conditional Branch: interpret_goal -> [task_planning | final_synthesis]
    workflow.add_conditional_edges(
        NODE_INTERPRET_GOAL,
        should_bypass,
        {
            NODE_TASK_PLANNING: NODE_TASK_PLANNING,
            NODE_FINAL_SYNTHESIS: NODE_FINAL_SYNTHESIS,
        },
    )

    # Deterministic sequence: task_planning -> tool_execution -> observation_processing
    workflow.add_edge(NODE_TASK_PLANNING, NODE_TOOL_EXECUTION)
    workflow.add_edge(NODE_TOOL_EXECUTION, NODE_OBSERVATION_PROCESSING)

    # Conditional Branch: observation_processing -> [replanning | final_synthesis]
    workflow.add_conditional_edges(
        NODE_OBSERVATION_PROCESSING,
        route_after_observation,
        {
            NODE_REPLANNING: NODE_REPLANNING,
            NODE_FINAL_SYNTHESIS: NODE_FINAL_SYNTHESIS,
        },
    )

    # Replanning loop: replanning -> tool_execution
    workflow.add_edge(NODE_REPLANNING, NODE_TOOL_EXECUTION)

    # Finalization: final_synthesis -> END
    workflow.add_edge(NODE_FINAL_SYNTHESIS, END)

    return workflow.compile(checkpointer=checkpointer)


def get_compiled_coach_graph(
    use_in_memory_checkpointer: bool = False,
) -> Any:
    """Returns a compiled instance of the coach agent graph.

    When use_in_memory_checkpointer is True, attaches an ephemeral MemorySaver
    checkpointer for in-memory execution inspection (zero persistent storage).
    """
    global _COMPILED_GRAPH
    if use_in_memory_checkpointer:
        return build_coach_agent_graph(checkpointer=MemorySaver())

    if _COMPILED_GRAPH is None:
        _COMPILED_GRAPH = build_coach_agent_graph(checkpointer=None)
    return _COMPILED_GRAPH
