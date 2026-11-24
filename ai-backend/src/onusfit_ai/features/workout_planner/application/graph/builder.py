"""Graph topology and compilation for FitOnus LangGraph Workout Planner workflow."""

from functools import partial
from typing import Any

from langgraph.graph import END, START, StateGraph

from onusfit_ai.features.workout_planner.application.generator import WorkoutPlanGenerator
from onusfit_ai.features.workout_planner.application.graph.nodes import (
    assemble_context_node,
    finalize_plan_node,
    generate_plan_node,
    repair_plan_node,
    retrieve_exercises_node,
    understand_goal_node,
    validate_plan_node,
)
from onusfit_ai.features.workout_planner.application.graph.routing import route_after_validation
from onusfit_ai.features.workout_planner.application.graph.state import WorkoutPlannerGraphState
from onusfit_ai.features.workout_planner.application.grounding import ExerciseCatalogIndex
from onusfit_ai.shared.llm.ports import TextGenerator

NODE_UNDERSTAND_GOAL = "understand_goal"
NODE_ASSEMBLE_CONTEXT = "assemble_context"
NODE_RETRIEVE_EXERCISES = "retrieve_exercises"
NODE_GENERATE_PLAN = "generate_plan"
NODE_VALIDATE_PLAN = "validate_plan"
NODE_REPAIR_PLAN = "repair_plan"
NODE_FINALIZE_PLAN = "finalize_plan"


def build_workout_planner_graph(
    llm: TextGenerator | None = None,
    tools_client: Any | None = None,
    catalog_index: ExerciseCatalogIndex | None = None,
    generator: WorkoutPlanGenerator | None = None,
) -> Any:
    """Build and compile the LangGraph StateGraph workflow for Workout Planning."""
    index = catalog_index or ExerciseCatalogIndex()
    gen = generator or WorkoutPlanGenerator(catalog_index=index)

    workflow = StateGraph(WorkoutPlannerGraphState)

    # 1. Register Nodes with bound dependencies
    workflow.add_node(
        NODE_UNDERSTAND_GOAL,
        partial(understand_goal_node, llm=llm),
    )
    workflow.add_node(
        NODE_ASSEMBLE_CONTEXT,
        partial(assemble_context_node, tools_client=tools_client),
    )
    workflow.add_node(
        NODE_RETRIEVE_EXERCISES,
        partial(retrieve_exercises_node, catalog_index=index),
    )
    workflow.add_node(
        NODE_GENERATE_PLAN,
        partial(generate_plan_node, generator=gen, llm=llm),
    )
    workflow.add_node(
        NODE_VALIDATE_PLAN,
        partial(validate_plan_node, catalog_index=index),
    )
    workflow.add_node(
        NODE_REPAIR_PLAN,
        partial(repair_plan_node, generator=gen),
    )
    workflow.add_node(NODE_FINALIZE_PLAN, finalize_plan_node)

    # 2. Register Edges
    workflow.add_edge(START, NODE_UNDERSTAND_GOAL)
    workflow.add_edge(NODE_UNDERSTAND_GOAL, NODE_ASSEMBLE_CONTEXT)
    workflow.add_edge(NODE_ASSEMBLE_CONTEXT, NODE_RETRIEVE_EXERCISES)
    workflow.add_edge(NODE_RETRIEVE_EXERCISES, NODE_GENERATE_PLAN)
    workflow.add_edge(NODE_GENERATE_PLAN, NODE_VALIDATE_PLAN)

    # Conditional Branch: validate_plan -> [repair_plan | finalize_plan]
    workflow.add_conditional_edges(
        NODE_VALIDATE_PLAN,
        route_after_validation,
        {
            "repair_plan": NODE_REPAIR_PLAN,
            "finalize_plan": NODE_FINALIZE_PLAN,
        },
    )

    # Repair loop: repair_plan -> validate_plan
    workflow.add_edge(NODE_REPAIR_PLAN, NODE_VALIDATE_PLAN)

    # Terminal edge
    workflow.add_edge(NODE_FINALIZE_PLAN, END)

    return workflow.compile()
