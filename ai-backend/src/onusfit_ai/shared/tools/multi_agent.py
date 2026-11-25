"""Composition-root provider registry for multi-agent dependencies.

Follows Clean/Hexagonal Architecture: holds only generic factory callables wired at
startup (`main.py`), with zero imports from any feature module.
"""

from collections.abc import Callable
from typing import Any

_a2a_mediator_factory: Callable[[], Any] | None = None
_workout_planner_factory: Callable[[], Any] | None = None


def set_multi_agent_providers(
    *,
    a2a_factory: Callable[[], Any] | None = None,
    workout_planner_factory: Callable[[], Any] | None = None,
) -> None:
    """Register factory callables at the composition root (`create_app`)."""
    global _a2a_mediator_factory, _workout_planner_factory
    _a2a_mediator_factory = a2a_factory
    _workout_planner_factory = workout_planner_factory


def create_a2a_mediator() -> Any | None:
    """Instantiate a request-scoped A2A mediator if registered at startup."""
    if _a2a_mediator_factory is None:
        return None
    return _a2a_mediator_factory()


def create_workout_planner_port() -> Any | None:
    """Instantiate a WorkoutPlannerPort adapter if registered at startup."""
    if _workout_planner_factory is None:
        return None
    return _workout_planner_factory()

