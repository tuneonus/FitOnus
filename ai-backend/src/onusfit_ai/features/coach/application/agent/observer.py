"""Observation processing and replanning evaluation for FitOnus AI Agent.

FitOnus Phase 09: AI Agent Fundamentals — Stage 05.
Processes raw tool results into structured observations, evaluates goal fulfillment,
identifies missing or conflicting data, and formulates replanning actions if necessary.
Strictly prevents fabricated fitness metrics.
"""

from typing import Any

from onusfit_ai.features.coach.domain.agent import (
    AgentBudgetConfig,
    AgentGoal,
    AgentGoalType,
    ObservationEvaluation,
    PlanStep,
    StepAction,
    StepStatus,
    ToolObservation,
)
from onusfit_ai.shared.contracts.tools import (
    TOOL_GET_NUTRITION_SUMMARY,
    TOOL_GET_RECENT_WORKOUTS,
    TOOL_GET_WEIGHT_TREND,
    TOOL_SEARCH_EXERCISES,
    GetRecentWorkoutsArgs,
)


class AgentObserver:
    """Processes tool outputs into structured observations and evaluates next actions."""

    def process_tool_result(
        self,
        step_id: int,
        tool_name: str,
        args: dict[str, Any],
        raw_result: dict[str, Any],
    ) -> ToolObservation:
        """Converts raw tool execution result into a structured ToolObservation."""
        has_error = "error" in raw_result or "message" in raw_result and "error" in str(raw_result)
        error_msg = str(raw_result.get("error")) if has_error else None

        if has_error:
            msg = error_msg or "Temporary service error"
            return ToolObservation(
                step_id=step_id,
                tool_name=tool_name,
                args=args,
                raw_result=raw_result,
                summary=f"Tool '{tool_name}' failed: {msg}. Data unavailable.",
                is_empty=True,
                has_error=True,
                error_message=error_msg,
                extracted_entities={},
            )

        extracted: dict[str, Any] = {}
        summary = ""
        is_empty = False

        if tool_name == TOOL_GET_RECENT_WORKOUTS:
            workouts = raw_result.get("workouts", [])
            count = len(workouts) if isinstance(workouts, list) else 0
            if count == 0:
                is_empty = True
                summary = f"No workout sessions recorded in the past {args.get('days', 7)} days."
            else:
                total_duration = sum(w.get("durationMinutes", 0) for w in workouts)
                total_volume = sum(w.get("volumeKg", 0) for w in workouts)
                total_calories = sum(w.get("caloriesBurned", 0) for w in workouts)
                names = [w.get("name", "Workout") for w in workouts[:3]]
                names_str = ", ".join(names) + ("..." if count > 3 else "")
                summary = (
                    f"Retrieved {count} workout(s) over past {args.get('days', 7)} days "
                    f"({names_str}). Total duration: {total_duration} mins, "
                    f"volume: {total_volume} kg, calories burned: {total_calories} kcal."
                )
                extracted = {
                    "workout_count": count,
                    "total_duration_mins": total_duration,
                    "total_volume_kg": total_volume,
                    "total_calories_burned": total_calories,
                }

        elif tool_name == TOOL_GET_NUTRITION_SUMMARY:
            days_data = raw_result.get("dailyLogs", raw_result.get("days", []))
            avg_calories = raw_result.get("averageCalories", raw_result.get("avgCalories"))
            avg_protein = raw_result.get("averageProteinGrams", raw_result.get("avgProtein"))
            if not days_data and avg_calories is None:
                is_empty = True
                summary = f"No nutrition logs found for the past {args.get('days', 7)} days."
            else:
                summary = (
                    f"Nutrition summary over past {args.get('days', 7)} days: "
                    f"Average intake: {avg_calories or 0:.0f} kcal/day, "
                    f"protein: {avg_protein or 0:.1f} g/day."
                )
                extracted = {
                    "average_calories": avg_calories,
                    "average_protein_grams": avg_protein,
                    "logged_days_count": len(days_data) if isinstance(days_data, list) else 0,
                }

        elif tool_name == TOOL_GET_WEIGHT_TREND:
            logs = raw_result.get("weightLogs", raw_result.get("logs", []))
            count = len(logs) if isinstance(logs, list) else 0
            days_count = args.get("days", 30)
            if count == 0:
                is_empty = True
                summary = f"No weight measurements recorded in the past {days_count} days."
            else:
                first_weight = logs[0].get("weightKg")
                last_weight = logs[-1].get("weightKg")
                delta = (last_weight - first_weight) if (first_weight and last_weight) else 0.0
                summary = (
                    f"Weight trend over past {days_count} days ({count} entries): "
                    f"Started at {first_weight} kg, currently {last_weight} kg "
                    f"(net change: {delta:+.1f} kg)."
                )
                extracted = {
                    "entries_count": count,
                    "start_weight_kg": first_weight,
                    "current_weight_kg": last_weight,
                    "net_delta_kg": delta,
                }

        elif tool_name == TOOL_SEARCH_EXERCISES:
            exercises = raw_result.get("exercises", [])
            count = len(exercises) if isinstance(exercises, list) else 0
            q = args.get("query")
            if count == 0:
                is_empty = True
                summary = f"No exercises found matching query '{q}'."
            else:
                names = [e.get("name") for e in exercises if e.get("name")]
                summary = f"Found {count} exercise(s) matching '{q}': {', '.join(names)}."
                extracted = {"matches_count": count, "exercise_names": names}

        else:
            res_preview = str(raw_result)[:80]
            summary = f"Tool '{tool_name}' executed successfully with result: {res_preview}."

        return ToolObservation(
            step_id=step_id,
            tool_name=tool_name,
            args=args,
            raw_result=raw_result,
            summary=summary,
            is_empty=is_empty,
            has_error=has_error,
            error_message=error_msg,
            extracted_entities=extracted,
        )

    def evaluate_observations(
        self,
        goal: AgentGoal,
        steps: list[PlanStep],
        observations: list[ToolObservation],
        budget: AgentBudgetConfig,
        replans_count: int,
    ) -> ObservationEvaluation:
        """Evaluates whether gathered observations satisfy the goal or require replanning."""
        executed_tool_names = {obs.tool_name for obs in observations}
        missing_domains: list[str] = []
        new_steps: list[PlanStep] = []
        needs_replanning = False
        replan_reason = None

        # Check for empty workout history when goal specifically asked for workouts
        workouts_obs = next(
            (o for o in observations if o.tool_name == TOOL_GET_RECENT_WORKOUTS),
            None,
        )
        if workouts_obs and workouts_obs.is_empty:
            requested_days = workouts_obs.args.get("days", 7)
            # If user looked for workouts in 7 days and found 0, and we haven't replanned yet,
            # we can expand window to 14 days to provide meaningful history.
            if (
                goal.goal_type in (AgentGoalType.WORKOUT_ANALYSIS, AgentGoalType.FITNESS_PROGRESS)
                and requested_days < 14
                and replans_count < budget.max_replanning_attempts
                and len(steps) < budget.max_planning_steps
            ):
                needs_replanning = True
                replan_reason = (
                    f"No workouts found in past {requested_days} days. "
                    "Expanding search window to 14 days."
                )
                new_step_id = len(steps) + 1
                new_steps.append(
                    PlanStep(
                        step_id=new_step_id,
                        description="Retrieve 14 days of workouts to detect earlier activity",
                        action=StepAction(
                            tool_name=TOOL_GET_RECENT_WORKOUTS,
                            args=GetRecentWorkoutsArgs(days=14).model_dump(exclude_none=True),
                            rationale="User has 0 workouts logged in past 7 days; check 14 days.",
                        ),
                        status=StepStatus.PENDING,
                    )
                )

        # Check required domains
        for domain in goal.target_domains:
            if domain == "workouts" and TOOL_GET_RECENT_WORKOUTS not in executed_tool_names:
                missing_domains.append("workouts")
            elif domain == "nutrition" and TOOL_GET_NUTRITION_SUMMARY not in executed_tool_names:
                missing_domains.append("nutrition")
            elif domain == "weight" and TOOL_GET_WEIGHT_TREND not in executed_tool_names:
                missing_domains.append("weight")
            elif domain == "exercises" and TOOL_SEARCH_EXERCISES not in executed_tool_names:
                missing_domains.append("exercises")

        # Goal is satisfied if all target steps have completed and no replan is required
        terminal_statuses = (StepStatus.COMPLETED, StepStatus.SKIPPED, StepStatus.FAILED)
        all_completed = all(s.status in terminal_statuses for s in steps)
        goal_satisfied = (all_completed or len(missing_domains) == 0) and not needs_replanning

        return ObservationEvaluation(
            goal_satisfied=goal_satisfied,
            needs_replanning=needs_replanning,
            replan_reason=replan_reason,
            missing_data_domains=missing_domains,
            new_steps=new_steps,
        )
