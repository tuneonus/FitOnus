"""Workout Plan Generator implementing structured outputs, grounding, and bounded repair."""

import logging
import uuid

from onusfit_ai.features.workout_planner.application.context import AssembledWorkoutContext
from onusfit_ai.features.workout_planner.application.grounding import (
    DEFAULT_EXERCISE_CATALOG,
    ExerciseCatalogIndex,
)
from onusfit_ai.features.workout_planner.application.prompts import (
    build_workout_generation_user_prompt,
)
from onusfit_ai.features.workout_planner.domain.contracts import (
    ExerciseItemGrounding,
    ExerciseSelection,
    ExperienceLevel,
    PlanValidationResult,
    SingleSessionPlan,
    WarmupCooldown,
    WeeklyWorkoutSchedule,
    WorkoutAdaptationRequest,
    WorkoutGenerationRequest,
    WorkoutGoal,
)
from onusfit_ai.features.workout_planner.domain.safety import validate_plan_safety
from onusfit_ai.shared.llm.ports import TextGenerator

logger = logging.getLogger("onusfit_ai.workout_planner.generator")


class WorkoutPlanGenerator:
    """Orchestrates structured LLM generation, catalog grounding, and bounded repairs."""

    def __init__(self, catalog_index: ExerciseCatalogIndex | None = None) -> None:
        self.catalog_index = catalog_index or ExerciseCatalogIndex()

    def _format_catalog_summary(self, exercises: list[ExerciseItemGrounding]) -> str:
        """Format catalog exercises as concise bullet list for LLM context."""
        lines = []
        for ex in exercises:
            muscles = ", ".join(ex.primary_muscles)
            lines.append(
                f"- ID: {ex.id} | Name: {ex.name} | Equipment: {ex.equipment} | "
                f"Muscle: {muscles} | Level: {ex.difficulty}"
            )
        return "\n".join(lines)

    def generate_deterministic_plan(
        self,
        request: WorkoutGenerationRequest,
        context: AssembledWorkoutContext,
    ) -> WeeklyWorkoutSchedule:
        """Create a guaranteed-valid, grounded workout plan without requiring an external LLM call.

        Used as offline fallback, test baseline, and bounded repair target.
        """
        available_exercises = self.catalog_index.filter_exercises(
            available_equipment=request.available_equipment,
            limitations=request.physical_limitations,
            excluded_names_or_ids=request.excluded_exercises,
        )
        if not available_exercises:
            available_exercises = [
                ex for ex in DEFAULT_EXERCISE_CATALOG if ex.equipment == "bodyweight"
            ]

        days = request.days_per_week
        sessions: list[SingleSessionPlan] = []

        all_day_names = [
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
            "Sunday",
        ]
        assigned_day_names = all_day_names[:days]
        unassigned_days = all_day_names[days:]
        recovery_days = unassigned_days if unassigned_days else ["Sunday"]

        goal_params = {
            WorkoutGoal.STRENGTH: ("5-6", 120, "High (RPE 8-9)"),
            WorkoutGoal.MUSCLE_BUILDING: ("8-12", 75, "Moderate-High (RPE 7-8)"),
            WorkoutGoal.FAT_LOSS: ("12-15", 45, "Moderate (RPE 6-7)"),
            WorkoutGoal.ENDURANCE: ("15-20", 30, "Moderate (RPE 6-7)"),
            WorkoutGoal.GENERAL_FITNESS: ("10-12", 60, "Moderate (RPE 7)"),
        }
        target_reps, rest_sec, intensity_str = goal_params.get(
            request.goal, ("10-12", 60, "Moderate")
        )

        sets_per_ex = 3 if request.experience_level != ExperienceLevel.ADVANCED else 4
        exercises_per_session = min(
            max(3, request.session_duration_minutes // 10),
            len(available_exercises),
            6,
        )

        for d_idx, day_name in enumerate(assigned_day_names):
            start_offset = (d_idx * exercises_per_session) % max(1, len(available_exercises))
            day_pool = (available_exercises[start_offset:] + available_exercises[:start_offset])[
                :exercises_per_session
            ]

            selected_exercises: list[ExerciseSelection] = []
            seen_ids: set[str] = set()

            for order, ex in enumerate(day_pool):
                if ex.id in seen_ids:
                    continue
                seen_ids.add(ex.id)

                alts = self.catalog_index.find_alternatives(
                    target_exercise_id=ex.id,
                    available_equipment=request.available_equipment,
                    limitations=request.physical_limitations,
                )

                selected_exercises.append(
                    ExerciseSelection(
                        exercise_id=ex.id,
                        name=ex.name,
                        target_muscle=ex.primary_muscles[0] if ex.primary_muscles else "full_body",
                        equipment=ex.equipment,
                        target_sets=sets_per_ex,
                        target_reps=target_reps,
                        rest_seconds=rest_sec,
                        target_weight_kg=0.0,
                        intensity=intensity_str,
                        notes=(
                            f"Controlled tempo. Target "
                            f"{ex.primary_muscles[0] if ex.primary_muscles else 'muscles'}."
                        ),
                        order_index=order,
                        alternatives=alts,
                    )
                )

            if request.language == "ta":
                day_title = f"{day_name} உடற்பயிற்சி - {request.goal.value}"
                focus_title = f"{request.goal.value} இலக்கு"
            elif request.language == "tanglish":
                day_title = f"{day_name} Workout - {request.goal.value} focus"
                focus_title = f"{request.goal.value} training session"
            else:
                day_title = f"{day_name} - {request.goal.value.replace('_', ' ').title()}"
                focus_title = f"{request.goal.value.replace('_', ' ').title()} Session"

            sessions.append(
                SingleSessionPlan(
                    session_id=str(uuid.uuid4()),
                    day_name=day_title,
                    focus=focus_title,
                    estimated_duration_minutes=request.session_duration_minutes,
                    difficulty=request.experience_level,
                    warmup=WarmupCooldown(
                        exercises=[
                            "Dynamic joint rotations",
                            "Light mobility drills",
                            "Core activation",
                        ],
                        duration_minutes=5,
                        notes="Warm up thoroughly before beginning working sets.",
                    ),
                    exercises=selected_exercises,
                    cooldown=WarmupCooldown(
                        exercises=["Static stretching", "Deep diaphragmatic breathing"],
                        duration_minutes=5,
                        notes="Gradual heart-rate reduction.",
                    ),
                )
            )

        lang = request.language
        if lang == "ta":
            title = f"{days}-நாள் {request.goal.value} பயிற்சி திட்டம்"
            description = f"{request.experience_level.value} நிலைக்கான பாதுகாப்பான உடற்பயிற்சி திட்டம்."
            rationale = [
                f"இலக்கு: {request.goal.value}",
                f"உபகரணங்கள்: {', '.join(request.available_equipment)}",
                f"வாராந்திர நாட்கள்: {days}",
            ]
        elif lang == "tanglish":
            title = f"{days}-Day {request.goal.value} Workout Plan"
            description = f"Custom workout plan for {request.experience_level.value} level."
            rationale = [
                f"Goal: {request.goal.value}",
                f"Equipment: {', '.join(request.available_equipment)}",
                f"Days: {days} days/week",
            ]
        else:
            title = f"{days}-Day Personalized {request.goal.value.replace('_', ' ').title()} Plan"
            description = (
                f"Science-based {request.experience_level.value} training program tailored "
                f"to your available equipment and physical goals."
            )
            rationale = [
                f"Programmed for {request.goal.value.replace('_', ' ')} with "
                f"{request.experience_level.value} progression.",
                f"Grounded in available equipment: {', '.join(request.available_equipment)}.",
                f"{days} training sessions with structured recovery days.",
            ]

        return WeeklyWorkoutSchedule(
            plan_id=str(uuid.uuid4()),
            title=title,
            description=description,
            goal=request.goal,
            level=request.experience_level,
            total_days_per_week=days,
            environment=request.environment,
            schedule_days=sessions,
            recovery_days=recovery_days,
            rationale=rationale,
            language=request.language,
        )

    async def generate_workout_plan(
        self,
        request: WorkoutGenerationRequest,
        context: AssembledWorkoutContext,
        llm: TextGenerator | None = None,
        max_repair_attempts: int = 1,
    ) -> tuple[WeeklyWorkoutSchedule, PlanValidationResult]:
        """Generate structured workout plan, validate safety, and repair if needed."""
        # Check medical red flags first
        red_flags = validate_plan_safety(
            plan=WeeklyWorkoutSchedule(
                plan_id=str(uuid.uuid4()),
                title="Medical Screen",
                description="Pre-screen",
                goal=request.goal,
                level=request.experience_level,
                total_days_per_week=1,
                schedule_days=[
                    SingleSessionPlan(
                        session_id="1",
                        day_name="Screen",
                        focus="Screen",
                        estimated_duration_minutes=30,
                        difficulty=request.experience_level,
                        exercises=[
                            ExerciseSelection(
                                exercise_id="a1111111-1111-4111-8111-111111111101",
                                name="Push-Up",
                                target_muscle="chest",
                                equipment="bodyweight",
                                target_sets=1,
                                target_reps="1",
                                rest_seconds=60,
                            )
                        ],
                    )
                ],
            ),
            request=request,
        ).medical_red_flags

        if red_flags:
            safe_plan = WeeklyWorkoutSchedule(
                plan_id=str(uuid.uuid4()),
                title="Clinical Guidance & Active Recovery",
                description=(
                    "Automated strenuous workout generation is halted due to detected "
                    "medical red flags. Please consult a qualified healthcare provider."
                ),
                goal=request.goal,
                level=request.experience_level,
                total_days_per_week=1,
                schedule_days=[
                    SingleSessionPlan(
                        session_id=str(uuid.uuid4()),
                        day_name="Active Recovery & Mobility",
                        focus="Gentle Mobility",
                        estimated_duration_minutes=20,
                        difficulty=ExperienceLevel.BEGINNER,
                        warmup=WarmupCooldown(exercises=["Light breathing"], duration_minutes=5),
                        exercises=[
                            ExerciseSelection(
                                exercise_id="a1111111-1111-4111-8111-111111111118",
                                name="Glute Bridge",
                                target_muscle="legs",
                                equipment="bodyweight",
                                target_sets=2,
                                target_reps="8-10",
                                rest_seconds=60,
                                intensity="Very Low (Recovery)",
                                notes=(
                                    "Gentle pain-free movement only. Stop immediately if "
                                    "discomfort occurs."
                                ),
                            )
                        ],
                        cooldown=WarmupCooldown(exercises=["Relaxation"], duration_minutes=5),
                    )
                ],
                recovery_days=["Everyday pending medical review"],
                rationale=["Medical red flag detected; intense exercise withheld for safety."],
                language=request.language,
            )
            val_result = PlanValidationResult(
                is_valid=False,
                errors=red_flags,
                warnings=[],
                safety_score=0.0,
                medical_red_flags=red_flags,
            )
            return safe_plan, val_result

        available_exercises = self.catalog_index.filter_exercises(
            available_equipment=request.available_equipment,
            limitations=request.physical_limitations,
            excluded_names_or_ids=request.excluded_exercises,
        )
        if not available_exercises:
            available_exercises = [
                ex for ex in DEFAULT_EXERCISE_CATALOG if ex.equipment == "bodyweight"
            ]

        valid_ids = self.catalog_index.get_all_ids()

        if llm is None:
            plan = self.generate_deterministic_plan(request, context)
            val_result = validate_plan_safety(plan, request, valid_catalog_ids=valid_ids)
            return plan, val_result

        catalog_summary = self._format_catalog_summary(available_exercises)
        user_prompt = build_workout_generation_user_prompt(
            goal=request.goal.value,
            experience_level=request.experience_level.value,
            available_equipment=request.available_equipment,
            days_per_week=request.days_per_week,
            session_duration_minutes=request.session_duration_minutes,
            environment=request.environment.value,
            physical_limitations=request.physical_limitations,
            catalog_exercises_summary=catalog_summary,
            target_muscles=request.target_muscles,
            preferred_exercises=request.preferred_exercises,
            excluded_exercises=request.excluded_exercises,
            recent_training_summary=context.recent_workout_summary,
            rag_context=context.rag_knowledge_excerpts,
            language=request.language,
        )

        try:
            llm_result = await llm.generate_text(
                prompt=user_prompt,
                primary_model="gemini-2.5-flash",
                fallback_model="gemini-2.5-flash-lite",
                deadline_s=20.0,
                schema=WeeklyWorkoutSchedule,
            )
            if isinstance(llm_result.parsed, WeeklyWorkoutSchedule):
                plan = llm_result.parsed
            elif isinstance(llm_result.parsed, dict):
                plan = WeeklyWorkoutSchedule.model_validate(llm_result.parsed)
            else:
                plan = self.generate_deterministic_plan(request, context)
        except Exception as exc:
            logger.warning(
                "LLM structured workout generation failed, using deterministic fallback: %s",
                exc,
            )
            plan = self.generate_deterministic_plan(request, context)

        val_result = validate_plan_safety(plan, request, valid_catalog_ids=valid_ids)

        repair_attempts = 0
        while not val_result.is_valid and repair_attempts < max_repair_attempts:
            repair_attempts += 1
            logger.info(
                "Plan validation failed (attempt %d). Repairing errors: %s",
                repair_attempts,
                val_result.errors,
            )
            repaired_plan = self._repair_plan(plan, val_result.errors, request, available_exercises)
            repaired_val = validate_plan_safety(repaired_plan, request, valid_catalog_ids=valid_ids)
            repaired_val.repaired = True
            plan = repaired_plan
            val_result = repaired_val

        if not val_result.is_valid:
            logger.warning(
                "Repair budget exhausted; substituting with deterministic grounded plan."
            )
            plan = self.generate_deterministic_plan(request, context)
            val_result = validate_plan_safety(plan, request, valid_catalog_ids=valid_ids)
            val_result.repaired = True

        return plan, val_result

    def _repair_plan(
        self,
        plan: WeeklyWorkoutSchedule,
        errors: list[str],
        request: WorkoutGenerationRequest,
        available_exercises: list[ExerciseItemGrounding],
    ) -> WeeklyWorkoutSchedule:
        """Deterministic bounded repair: fixes ungrounded IDs, equipment, duplicates, volume."""
        valid_ex_map = {ex.id: ex for ex in available_exercises}
        fallback_pool = list(available_exercises)

        repaired_sessions: list[SingleSessionPlan] = []
        max_session_sets = 18 if request.experience_level == ExperienceLevel.BEGINNER else 24

        for session in plan.schedule_days:
            repaired_exercises: list[ExerciseSelection] = []
            seen_ids: set[str] = set()
            total_sets = 0

            for ex_idx, ex in enumerate(session.exercises):
                curr_id = ex.exercise_id
                target_ex = valid_ex_map.get(curr_id)

                if not target_ex or curr_id in seen_ids:
                    replacement = next(
                        (cand for cand in fallback_pool if cand.id not in seen_ids),
                        fallback_pool[0] if fallback_pool else None,
                    )
                    if replacement:
                        curr_id = replacement.id
                        target_ex = replacement
                        muscle_target = (
                            replacement.primary_muscles[0]
                            if replacement.primary_muscles
                            else "full_body"
                        )
                        ex = ExerciseSelection(
                            exercise_id=replacement.id,
                            name=replacement.name,
                            target_muscle=muscle_target,
                            equipment=replacement.equipment,
                            target_sets=min(ex.target_sets, 4),
                            target_reps=ex.target_reps or "10-12",
                            rest_seconds=ex.rest_seconds if (15 <= ex.rest_seconds <= 180) else 60,
                            target_weight_kg=0.0,
                            intensity=ex.intensity,
                            notes=ex.notes,
                            order_index=ex_idx,
                        )

                seen_ids.add(curr_id)

                safe_sets = min(ex.target_sets, 4)
                if total_sets + safe_sets > max_session_sets:
                    safe_sets = max(1, max_session_sets - total_sets)

                total_sets += safe_sets
                repaired_exercises.append(
                    ex.model_copy(
                        update={
                            "target_sets": safe_sets,
                            "order_index": len(repaired_exercises),
                        }
                    )
                )

                if total_sets >= max_session_sets:
                    break

            repaired_sessions.append(session.model_copy(update={"exercises": repaired_exercises}))

        return plan.model_copy(update={"schedule_days": repaired_sessions})

    def adapt_workout_plan(
        self,
        request: WorkoutAdaptationRequest,
        llm: TextGenerator | None = None,
    ) -> tuple[WeeklyWorkoutSchedule, PlanValidationResult]:
        """Adapt existing workout plan based on missed sessions, duration, or equipment changes."""
        current = request.current_plan
        adapted_sessions: list[SingleSessionPlan] = []

        active_equipment = request.new_equipment or [
            ex.equipment for s in current.schedule_days for ex in s.exercises
        ]
        available_exercises = self.catalog_index.filter_exercises(
            available_equipment=active_equipment
        )
        valid_ids = self.catalog_index.get_all_ids()

        set_adjustment = 0
        rest_adjustment = 0
        if request.difficulty_feedback == "too_hard" or (
            request.recovery_score and request.recovery_score < 40
        ):
            set_adjustment = -1
            rest_adjustment = 15
        elif request.difficulty_feedback == "too_easy" and (
            request.recovery_score is None or request.recovery_score > 75
        ):
            set_adjustment = 1
            rest_adjustment = -10

        target_duration = request.reduced_duration_minutes

        for session in current.schedule_days:
            is_missed = (
                session.session_id in request.missed_sessions
                or session.day_name in request.missed_sessions
            )

            new_duration = (
                target_duration
                if target_duration is not None
                else session.estimated_duration_minutes
            )
            new_exercises: list[ExerciseSelection] = []
            seen_exercise_ids: set[str] = set()

            for ex in session.exercises:
                ex_equip = ex.equipment.lower()
                is_compat = any(
                    eq.lower() in ex_equip or ex_equip in eq.lower() for eq in active_equipment
                )
                if (not is_compat or ex.exercise_id in seen_exercise_ids) and available_exercises:
                    alt = next(
                        (
                            c
                            for c in available_exercises
                            if c.id not in seen_exercise_ids
                            and c.primary_muscles
                            and c.primary_muscles[0] == ex.target_muscle
                        ),
                        next(
                            (c for c in available_exercises if c.id not in seen_exercise_ids),
                            None,
                        ),
                    )
                    if alt:
                        ex = ex.model_copy(
                            update={
                                "exercise_id": alt.id,
                                "name": alt.name,
                                "equipment": alt.equipment,
                            }
                        )
                    else:
                        continue

                if ex.exercise_id in seen_exercise_ids:
                    continue
                seen_exercise_ids.add(ex.exercise_id)

                new_sets = max(2, min(5, ex.target_sets + set_adjustment))
                new_rest = max(30, min(180, ex.rest_seconds + rest_adjustment))

                if (
                    target_duration is not None
                    and target_duration <= 30
                    and len(new_exercises) >= 4
                ):
                    continue

                new_exercises.append(
                    ex.model_copy(update={"target_sets": new_sets, "rest_seconds": new_rest})
                )

            for idx, e in enumerate(new_exercises):
                new_exercises[idx] = e.model_copy(update={"order_index": idx})

            notes = session.notes
            if is_missed:
                notes = (notes or "") + " [Adapted: Catch-up session with adjusted volume]"

            adapted_sessions.append(
                session.model_copy(
                    update={
                        "estimated_duration_minutes": new_duration,
                        "exercises": new_exercises,
                        "notes": notes.strip() if notes else None,
                    }
                )
            )

        adapted_plan = current.model_copy(
            update={
                "schedule_days": adapted_sessions,
                "rationale": current.rationale
                + [f"Adapted dynamically for {request.difficulty_feedback or 'user constraints'}."],
            }
        )

        mock_req = WorkoutGenerationRequest(
            user_id=request.user_id,
            goal=current.goal,
            experience_level=current.level,
            available_equipment=active_equipment,
            days_per_week=len(adapted_sessions),
            session_duration_minutes=target_duration or 45,
            language=request.language,
        )
        val_result = validate_plan_safety(adapted_plan, mock_req, valid_catalog_ids=valid_ids)
        return adapted_plan, val_result
