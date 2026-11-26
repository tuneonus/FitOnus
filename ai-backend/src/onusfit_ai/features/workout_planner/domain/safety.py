"""Deterministic workout safety and compliance validation engine.

Evaluates generated workout plans against physiological rules, volume caps,
equipment constraints, injury contraindications, and medical red flags,
completely independent of LLM generative output.
"""

import re
from typing import Any, Final

from onusfit_ai.features.workout_planner.domain.contracts import (
    ExperienceLevel,
    PlanValidationResult,
    WeeklyWorkoutSchedule,
    WorkoutGenerationRequest,
)

# Medical red flags requiring immediate clinical avoidance (English, Tamil, and Tanglish)
RED_FLAG_PATTERNS: Final[list[re.Pattern[str]]] = [
    re.compile(
        r"\b(chest\s+pain|angina|cardiac|tight\s+chest|shortness\s+of\s+breath)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(fractur\w*|broken\s+bone|cast|acute\s+(\w+\s+)?tear|severe\s+sharp\s+pain)\b",
        re.IGNORECASE,
    ),
    re.compile(r"\b(dizziness|dizzy|faint\w*|syncope|vertigo|blackout\w*)\b", re.IGNORECASE),
    re.compile(r"\b(post[\s-]surgery|unhealed\s+wound)\b", re.IGNORECASE),
    re.compile(r"\b(numbness|tingling|radiating\s+pain)\b", re.IGNORECASE),
    re.compile(
        r"(?:நெஞ்சு\s*வலி|மார்பு\s*வலி|மூச்சு\s*த்திணறல்|மூச்சுத்\s*திணறல்|மயக்கம்|தலைச்சுற்றல்|எலும்பு\s*முறிவு|மரத்துப்\s*போதல்|கடுமையான\s*(?:கூர்மையான\s*)?வலி)"
    ),
    re.compile(
        r"\b(?:nenju\s+vali\w*|marbu\s+vali\w*|moochu\s*thinaral|mayakkam|thalai\s*suth\w*|"
        r"elumbu\s*murivu|marathu\s*po\w*|koorumaiyana\s+vali)\b",
        re.IGNORECASE,
    ),
]

# Injury contraindications: maps limitation keyword to forbidden exercise keywords
INJURY_CONTRAINDICATIONS: Final[dict[str, list[str]]] = {
    "knee": [
        "barbell squat",
        "jumping lunge",
        "box jump",
        "plyometric",
        "jump squat",
        "sissy squat",
    ],
    "shoulder": [
        "behind the neck",
        "upright row",
        "snatch",
        "extreme overhead",
        "clean and press",
    ],
    "back": [
        "deadlift",
        "good morning",
        "heavy barbell bent-over row",
        "stiff leg deadlift",
        "t-bar row",
    ],
    "lumbar": ["deadlift", "good morning", "barbell row", "heavy squat"],
    "wrist": ["straight bar curl", "heavy front squat", "clean", "handstand"],
    "neck": ["behind the neck press", "neck bridge", "heavy shrug"],
    "elbow": ["skull crusher", "heavy dips", "barbell tricep extension"],
}

# Volume caps by experience level (max working sets per session)
MAX_SETS_PER_SESSION: Final[dict[ExperienceLevel, int]] = {
    ExperienceLevel.BEGINNER: 18,
    ExperienceLevel.INTERMEDIATE: 24,
    ExperienceLevel.ADVANCED: 30,
}

MAX_WEEKLY_SETS: Final[dict[str, int]] = {
    "beginner": 18,
    "intermediate": 24,
    "advanced": 30,
}

CLINICAL_DISCLAIMERS: Final[list[str]] = [
    "consult a doctor",
    "consult a physician",
    "medical professional",
    "healthcare provider",
    "stop exercising immediately",
    "seek medical",
    "orthopedic",
    "physical therapist",
    "physician",
]

# Maximum sets per muscle group in a single workout session
MAX_SETS_PER_MUSCLE_PER_SESSION: Final[int] = 12


def detect_medical_red_flags(limitations: list[str], user_notes: str | None = None) -> list[str]:
    """Check for acute clinical red flags that prohibit automated exercise prescription."""
    return WorkoutSafetyValidator.check_medical_red_flags(limitations, user_notes)


def find_contraindicated_exercises(
    exercise_id: str,
    exercise_name: str,
    limitations: list[str],
) -> list[str]:
    """Return any contraindications violated by an exercise given reported limitations."""
    violations: list[str] = []
    ex_lower = exercise_name.lower()
    for lim in limitations:
        lim_lower = lim.lower()
        for body_part, forbidden_list in INJURY_CONTRAINDICATIONS.items():
            if body_part in lim_lower:
                for forbidden in forbidden_list:
                    if forbidden in ex_lower:
                        violations.append(f"Contraindicated for {body_part} ({forbidden})")
    return violations


class WorkoutSafetyValidator:
    """Validates workout plans against strict clinical, physiological, and catalog rules."""

    @classmethod
    def validate(
        cls,
        plan_or_dict: WeeklyWorkoutSchedule | dict[str, Any],
        request: WorkoutGenerationRequest | None = None,
        valid_catalog_ids: set[str] | None = None,
    ) -> PlanValidationResult:
        """Validate either a WeeklyWorkoutSchedule model or plan dictionary."""
        if isinstance(plan_or_dict, dict):
            try:
                plan = WeeklyWorkoutSchedule.model_validate(plan_or_dict)
            except Exception as e:
                return PlanValidationResult(
                    is_valid=False,
                    errors=[f"Schema validation error: {e}"],
                    safety_score=0.0,
                )
        else:
            plan = plan_or_dict

        if request is None:
            request = WorkoutGenerationRequest(
                user_id="test_validate",
                goal=plan.goal,
                experience_level=plan.level,
                days_per_week=plan.total_days_per_week,
            )

        return cls.validate_plan(plan, request, valid_catalog_ids)

    @classmethod
    def check_medical_red_flags(
        cls, limitations: list[str], user_notes: str | None = None
    ) -> list[str]:
        """Check for acute clinical red flags that prohibit automated exercise prescription."""
        text_to_check = " ".join(limitations)
        if user_notes:
            text_to_check += " " + user_notes

        flags: list[str] = []
        for pattern in RED_FLAG_PATTERNS:
            match = pattern.search(text_to_check)
            if match:
                flags.append(
                    f"Medical red flag detected: '{match.group(0)}'. "
                    f"Physician or physical therapist evaluation required."
                )
        return flags

    @classmethod
    def validate_plan(
        cls,
        plan: WeeklyWorkoutSchedule,
        request: WorkoutGenerationRequest,
        valid_catalog_ids: set[str] | None = None,
    ) -> PlanValidationResult:
        """Deterministically validate a weekly workout plan."""
        errors: list[str] = []
        warnings: list[str] = []

        # 1. Medical red flags check
        red_flags = cls.check_medical_red_flags(request.physical_limitations)
        if red_flags:
            errors.extend(red_flags)
            return PlanValidationResult(
                is_valid=False,
                errors=errors,
                warnings=warnings,
                safety_score=0.0,
                medical_red_flags=red_flags,
            )

        # 2. Equipment normalization
        available_equipment = {e.lower().strip() for e in request.available_equipment}
        available_equipment.add("bodyweight")
        available_equipment.add("none")

        # 3. Limitations normalization
        active_limitations = [lim.lower().strip() for lim in request.physical_limitations]

        # 4. Validate each session
        max_session_sets = MAX_SETS_PER_SESSION.get(request.experience_level, 24)

        for s_idx, session in enumerate(plan.schedule_days):
            session_prefix = f"[{session.day_name or f'Day {s_idx + 1}'}]"
            total_session_sets = 0
            muscle_group_sets: dict[str, int] = {}
            seen_exercise_ids: set[str] = set()

            if len(session.exercises) == 0:
                errors.append(f"{session_prefix} Workout session has no exercises prescribed.")
                continue

            for exercise in session.exercises:
                ex_name_lower = exercise.name.lower()
                ex_equip_lower = exercise.equipment.lower()
                ex_muscle = exercise.target_muscle.lower()

                # A. Catalog ID grounding check
                if valid_catalog_ids is not None and exercise.exercise_id not in valid_catalog_ids:
                    errors.append(
                        f"{session_prefix} Unknown exercise ID '{exercise.exercise_id}' "
                        f"for '{exercise.name}' not in catalog."
                    )

                # B. Duplicate exercise check within same session
                if exercise.exercise_id in seen_exercise_ids:
                    errors.append(
                        f"{session_prefix} Duplicate exercise detected: '{exercise.name}' "
                        f"appears multiple times."
                    )
                seen_exercise_ids.add(exercise.exercise_id)

                # C. Equipment compatibility check
                has_compatible_equipment = (
                    "bodyweight" in ex_equip_lower
                    or "none" in ex_equip_lower
                    or any(
                        eq in ex_equip_lower or ex_equip_lower in eq for eq in available_equipment
                    )
                )
                if not has_compatible_equipment:
                    errors.append(
                        f"{session_prefix} Exercise '{exercise.name}' requires "
                        f"'{exercise.equipment}' which is not in available equipment: "
                        f"{sorted(available_equipment)}."
                    )

                # D. Physical limitations & injury contraindication check
                for lim in active_limitations:
                    for body_part, contraindicated_keywords in INJURY_CONTRAINDICATIONS.items():
                        if body_part in lim:
                            for forbidden in contraindicated_keywords:
                                if forbidden in ex_name_lower:
                                    errors.append(
                                        f"{session_prefix} Contraindicated exercise "
                                        f"'{exercise.name}' prescribed despite reported "
                                        f"limitation: '{lim}'."
                                    )

                # E. Sets and repetitions sanity
                if exercise.target_sets <= 0:
                    errors.append(
                        f"{session_prefix} Exercise '{exercise.name}' has invalid sets: "
                        f"{exercise.target_sets}."
                    )
                elif exercise.target_sets > 8:
                    errors.append(
                        f"{session_prefix} Exercise '{exercise.name}' exceeds safe working "
                        f"sets cap: {exercise.target_sets} > 8."
                    )

                if exercise.rest_seconds < 15 or exercise.rest_seconds > 300:
                    warnings.append(
                        f"{session_prefix} Exercise '{exercise.name}' rest period "
                        f"{exercise.rest_seconds}s outside standard (15-300s)."
                    )

                # Accumulate volume
                total_session_sets += exercise.target_sets
                current_m = muscle_group_sets.get(ex_muscle, 0)
                muscle_group_sets[ex_muscle] = current_m + exercise.target_sets

            # F. Total session volume cap
            if total_session_sets > max_session_sets:
                errors.append(
                    f"{session_prefix} Total working sets ({total_session_sets}) exceeds "
                    f"maximum safe threshold ({max_session_sets}) for "
                    f"{request.experience_level.value} level."
                )

            # G. Per-muscle volume cap
            for muscle, m_sets in muscle_group_sets.items():
                if m_sets > MAX_SETS_PER_MUSCLE_PER_SESSION:
                    warnings.append(
                        f"{session_prefix} High volume on {muscle}: {m_sets} sets in "
                        f"single session (guideline <= {MAX_SETS_PER_MUSCLE_PER_SESSION})."
                    )

            # H. Session duration vs sets feasibility check
            min_feasible_duration = int(total_session_sets * 2.5)
            if session.estimated_duration_minutes < min_feasible_duration:
                warnings.append(
                    f"{session_prefix} Prescribed duration ({session.estimated_duration_minutes}m) "
                    f"may be too short for {total_session_sets} sets "
                    f"(estimated min {min_feasible_duration}m)."
                )

        # 5. Recovery scheduling validation
        num_workout_days = len(plan.schedule_days)
        if request.days_per_week >= 7 and len(plan.recovery_days) == 0:
            warnings.append(
                "7-day consecutive training schedule without scheduled recovery days risks "
                "overtraining."
            )

        if num_workout_days > request.days_per_week:
            errors.append(
                f"Plan contains {num_workout_days} workout days but requested "
                f"{request.days_per_week} days per week."
            )

        # Compute safety score
        if errors:
            safety_score = max(0.0, 1.0 - (len(errors) * 0.25))
            is_valid = False
        else:
            safety_score = max(0.7, 1.0 - (len(warnings) * 0.05))
            is_valid = True

        return PlanValidationResult(
            is_valid=is_valid,
            errors=errors,
            warnings=warnings,
            safety_score=safety_score,
            medical_red_flags=[],
        )


def validate_plan_safety(
    plan: WeeklyWorkoutSchedule,
    request: WorkoutGenerationRequest,
    valid_catalog_ids: set[str] | None = None,
) -> PlanValidationResult:
    """Convenience helper for plan safety validation."""
    return WorkoutSafetyValidator.validate_plan(plan, request, valid_catalog_ids)
