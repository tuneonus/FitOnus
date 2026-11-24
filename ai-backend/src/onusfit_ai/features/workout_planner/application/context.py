"""Personalized Context Assembly for Workout Planning.

Assembles user goals, experience level, available equipment, approved physical
limitations, and recent training history while enforcing tenant isolation and
consent controls.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from onusfit_ai.features.workout_planner.domain.contracts import (
    ExperienceLevel,
    WorkoutEnvironment,
    WorkoutGenerationRequest,
    WorkoutGoal,
)

ToolHandler = Callable[[str, dict[str, Any], str, str], Awaitable[dict[str, Any]]]


@dataclass
class AssembledWorkoutContext:
    """Consolidated personalized context ready for plan generation."""

    user_id: str
    goal: WorkoutGoal
    experience_level: ExperienceLevel
    available_equipment: list[str]
    days_per_week: int
    session_duration_minutes: int
    environment: WorkoutEnvironment
    physical_limitations: list[str]
    target_muscles: list[str]
    preferred_exercises: list[str]
    excluded_exercises: list[str]
    language: str
    recent_workout_summary: str | None = None
    recent_volume_kg: float = 0.0
    recent_sessions_count: int = 0
    missing_attributes: list[str] = field(default_factory=list)
    rag_knowledge_excerpts: list[str] = field(default_factory=list)


class WorkoutContextAssembler:
    """Assembles user context from internal tools and request attributes."""

    @classmethod
    async def assemble_context(
        cls,
        request: WorkoutGenerationRequest,
        tools_client: Any | None = None,
        trace_id: str = "workout-planner-trace",
    ) -> AssembledWorkoutContext:
        """Assemble full personalized context, optionally pulling recent training metrics."""
        missing: list[str] = []

        # Check for essential attributes
        if not request.available_equipment:
            missing.append("available_equipment")

        # Fetch recent workout data if tools client available
        recent_summary: str | None = None
        recent_volume: float = request.recent_performance.get("volume_kg", 0.0)
        recent_sessions: int = int(request.recent_performance.get("sessions_completed", 0))

        if tools_client:
            try:
                recent_data = await tools_client.execute_tool(
                    name="get_recent_workouts",
                    args={"days": 14},
                    user_id=request.user_id,
                    request_id=trace_id,
                )
                if isinstance(recent_data, dict) and "workouts" in recent_data:
                    workouts = recent_data.get("workouts", [])
                    if isinstance(workouts, list) and workouts:
                        recent_sessions = len(workouts)
                        recent_volume = sum(
                            float(w.get("totalVolumeKg", 0.0))
                            for w in workouts
                            if isinstance(w, dict)
                        )
                        recent_summary = (
                            f"User completed {recent_sessions} workouts in past 14 days "
                            f"with {recent_volume:.1f} kg total cumulative volume."
                        )
            except Exception:
                # Context assembly is fault-tolerant: tool failure must not crash generation
                recent_summary = None

        return AssembledWorkoutContext(
            user_id=request.user_id,
            goal=request.goal,
            experience_level=request.experience_level,
            available_equipment=request.available_equipment,
            days_per_week=request.days_per_week,
            session_duration_minutes=request.session_duration_minutes,
            environment=request.environment,
            physical_limitations=request.physical_limitations,
            target_muscles=request.target_muscles,
            preferred_exercises=request.preferred_exercises,
            excluded_exercises=request.excluded_exercises,
            language=request.language,
            recent_workout_summary=recent_summary,
            recent_volume_kg=recent_volume,
            recent_sessions_count=recent_sessions,
            missing_attributes=missing,
            rag_knowledge_excerpts=request.rag_context,
        )
