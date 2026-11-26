"""LangGraph StateGraph builder for FitOnus Phase 13 Multi-Agent Orchestration."""

from functools import lru_cache
from typing import Any

from langgraph.graph import END, START, StateGraph

from onusfit_ai.features.coach.application.multi_agent.graph.nodes import (
    aggregate_results_node,
    delegate_tasks_node,
    execute_tasks_node,
    final_synthesis_node,
    interpret_intent_node,
    replan_tasks_node,
    select_agents_node,
    validate_results_node,
)
from onusfit_ai.features.coach.application.multi_agent.graph.routing import (
    route_after_select_agents,
    route_after_validation,
)
from onusfit_ai.features.coach.application.multi_agent.graph.state import (
    MultiAgentGraphState,
)


def build_multi_agent_graph() -> StateGraph[MultiAgentGraphState]:
    """Construct the bounded supervisor multi-agent StateGraph topology.

    START -> interpret_intent -> select_agents
          -> [BYPASS -> final_synthesis | DELEGATE -> delegate_tasks]
          -> execute_agents -> aggregate_results -> validate_results
          -> [REPLAN -> replan_tasks -> delegate_tasks | SYNTHESIZE -> final_synthesis]
          -> END
    """
    graph = StateGraph(MultiAgentGraphState)

    graph.add_node("interpret_intent", interpret_intent_node)
    graph.add_node("select_agents", select_agents_node)
    graph.add_node("delegate_tasks", delegate_tasks_node)
    graph.add_node("execute_agents", execute_tasks_node)
    graph.add_node("aggregate_results", aggregate_results_node)
    graph.add_node("validate_results", validate_results_node)
    graph.add_node("replan_tasks", replan_tasks_node)
    graph.add_node("final_synthesis", final_synthesis_node)

    graph.add_edge(START, "interpret_intent")
    graph.add_edge("interpret_intent", "select_agents")
    graph.add_conditional_edges(
        "select_agents",
        route_after_select_agents,
        {
            "delegate_tasks": "delegate_tasks",
            "final_synthesis": "final_synthesis",
        },
    )
    graph.add_edge("delegate_tasks", "execute_agents")
    graph.add_edge("execute_agents", "aggregate_results")
    graph.add_edge("aggregate_results", "validate_results")
    graph.add_conditional_edges(
        "validate_results",
        route_after_validation,
        {
            "replan_tasks": "replan_tasks",
            "final_synthesis": "final_synthesis",
        },
    )
    graph.add_edge("replan_tasks", "delegate_tasks")
    graph.add_edge("final_synthesis", END)

    return graph


@lru_cache(maxsize=1)
def get_compiled_multi_agent_graph() -> Any:
    """Return the cached compiled multi-agent LangGraph executable."""
    return build_multi_agent_graph().compile()
