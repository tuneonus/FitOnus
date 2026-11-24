"""Exercise grounding, catalog indexing, and alternative resolution.

Ensures generated workout plans reference ONLY real, verified exercise UUIDs
and respects equipment, difficulty, and physical limitation constraints.
"""

from typing import Final

from onusfit_ai.features.workout_planner.domain.contracts import (
    ExerciseAlternative,
    ExerciseItemGrounding,
    ExperienceLevel,
)

# Deterministic default catalog grounded in FitOnus exercise library
DEFAULT_EXERCISE_CATALOG: Final[list[ExerciseItemGrounding]] = [
    ExerciseItemGrounding(
        id="a1111111-1111-4111-8111-111111111101",
        name="Push-Up",
        primary_muscles=["chest"],
        secondary_muscles=["triceps", "shoulders", "core"],
        equipment="bodyweight",
        difficulty="beginner",
        is_compound=True,
    ),
    ExerciseItemGrounding(
        id="a1111111-1111-4111-8111-111111111102",
        name="Dumbbell Bench Press",
        primary_muscles=["chest"],
        secondary_muscles=["triceps", "shoulders"],
        equipment="dumbbells",
        difficulty="intermediate",
        is_compound=True,
    ),
    ExerciseItemGrounding(
        id="a1111111-1111-4111-8111-111111111103",
        name="Barbell Bench Press",
        primary_muscles=["chest"],
        secondary_muscles=["triceps", "shoulders"],
        equipment="barbell",
        difficulty="intermediate",
        is_compound=True,
    ),
    ExerciseItemGrounding(
        id="a1111111-1111-4111-8111-111111111104",
        name="Incline Dumbbell Press",
        primary_muscles=["chest"],
        secondary_muscles=["shoulders", "triceps"],
        equipment="dumbbells",
        difficulty="intermediate",
        is_compound=True,
    ),
    ExerciseItemGrounding(
        id="a1111111-1111-4111-8111-111111111105",
        name="Pull-Up",
        primary_muscles=["back"],
        secondary_muscles=["biceps", "forearms"],
        equipment="pull_up_bar",
        difficulty="intermediate",
        is_compound=True,
    ),
    ExerciseItemGrounding(
        id="a1111111-1111-4111-8111-111111111106",
        name="Lat Pulldown",
        primary_muscles=["back"],
        secondary_muscles=["biceps"],
        equipment="cable_machine",
        difficulty="beginner",
        is_compound=True,
    ),
    ExerciseItemGrounding(
        id="a1111111-1111-4111-8111-111111111107",
        name="Dumbbell Bent-Over Row",
        primary_muscles=["back"],
        secondary_muscles=["biceps", "core"],
        equipment="dumbbells",
        difficulty="beginner",
        is_compound=True,
    ),
    ExerciseItemGrounding(
        id="a1111111-1111-4111-8111-111111111108",
        name="Barbell Squat",
        primary_muscles=["legs"],
        secondary_muscles=["glutes", "core"],
        equipment="barbell",
        difficulty="intermediate",
        is_compound=True,
    ),
    ExerciseItemGrounding(
        id="a1111111-1111-4111-8111-111111111109",
        name="Goblet Squat",
        primary_muscles=["legs"],
        secondary_muscles=["glutes", "core"],
        equipment="dumbbells",
        difficulty="beginner",
        is_compound=True,
    ),
    ExerciseItemGrounding(
        id="a1111111-1111-4111-8111-111111111110",
        name="Bodyweight Squat",
        primary_muscles=["legs"],
        secondary_muscles=["glutes", "quads"],
        equipment="bodyweight",
        difficulty="beginner",
        is_compound=True,
    ),
    ExerciseItemGrounding(
        id="a1111111-1111-4111-8111-111111111111",
        name="Romanian Deadlift",
        primary_muscles=["legs"],
        secondary_muscles=["hamstrings", "glutes", "lower_back"],
        equipment="dumbbells",
        difficulty="intermediate",
        is_compound=True,
    ),
    ExerciseItemGrounding(
        id="a1111111-1111-4111-8111-111111111112",
        name="Dumbbell Overhead Shoulder Press",
        primary_muscles=["shoulders"],
        secondary_muscles=["triceps", "core"],
        equipment="dumbbells",
        difficulty="intermediate",
        is_compound=True,
    ),
    ExerciseItemGrounding(
        id="a1111111-1111-4111-8111-111111111113",
        name="Lateral Raise",
        primary_muscles=["shoulders"],
        secondary_muscles=["traps"],
        equipment="dumbbells",
        difficulty="beginner",
        is_compound=False,
    ),
    ExerciseItemGrounding(
        id="a1111111-1111-4111-8111-111111111114",
        name="Plank",
        primary_muscles=["core"],
        secondary_muscles=["shoulders"],
        equipment="bodyweight",
        difficulty="beginner",
        is_compound=False,
    ),
    ExerciseItemGrounding(
        id="a1111111-1111-4111-8111-111111111115",
        name="Dumbbell Bicep Curl",
        primary_muscles=["arms"],
        secondary_muscles=["forearms"],
        equipment="dumbbells",
        difficulty="beginner",
        is_compound=False,
    ),
    ExerciseItemGrounding(
        id="a1111111-1111-4111-8111-111111111116",
        name="Bench Dips",
        primary_muscles=["arms"],
        secondary_muscles=["chest", "shoulders"],
        equipment="bench",
        difficulty="beginner",
        is_compound=True,
    ),
    ExerciseItemGrounding(
        id="a1111111-1111-4111-8111-111111111117",
        name="Walking Lunges",
        primary_muscles=["legs"],
        secondary_muscles=["glutes", "quads"],
        equipment="bodyweight",
        difficulty="beginner",
        is_compound=True,
    ),
    ExerciseItemGrounding(
        id="a1111111-1111-4111-8111-111111111118",
        name="Glute Bridge",
        primary_muscles=["legs"],
        secondary_muscles=["glutes", "hamstrings", "core"],
        equipment="bodyweight",
        difficulty="beginner",
        is_compound=False,
    ),
    ExerciseItemGrounding(
        id="a1111111-1111-4111-8111-111111111119",
        name="Leg Press",
        primary_muscles=["legs"],
        secondary_muscles=["quads", "glutes"],
        equipment="machine",
        difficulty="beginner",
        is_compound=True,
    ),
    ExerciseItemGrounding(
        id="a1111111-1111-4111-8111-111111111120",
        name="Cable Face Pull",
        primary_muscles=["shoulders"],
        secondary_muscles=["upper_back", "rotator_cuff"],
        equipment="cable_machine",
        difficulty="beginner",
        is_compound=False,
    ),
]


class ExerciseCatalogIndex:
    """Fast in-memory index for matching, searching, and grounding exercises."""

    def __init__(self, catalog: list[ExerciseItemGrounding] | None = None) -> None:
        self._catalog = catalog if catalog is not None else DEFAULT_EXERCISE_CATALOG
        self._by_id: dict[str, ExerciseItemGrounding] = {ex.id: ex for ex in self._catalog}
        self._by_name: dict[str, ExerciseItemGrounding] = {
            ex.name.lower().strip(): ex for ex in self._catalog
        }

    @property
    def catalog(self) -> list[ExerciseItemGrounding]:
        return list(self._catalog)

    def search_by_name(self, query: str, limit: int = 5) -> list[ExerciseItemGrounding]:
        q = query.lower().strip()
        matches = [ex for ex in self._catalog if q in ex.name.lower()]
        return matches[:limit]

    def get_by_id(self, exercise_id: str) -> ExerciseItemGrounding | None:
        return self._by_id.get(exercise_id)

    def get_by_name(self, name: str) -> ExerciseItemGrounding | None:
        return self._by_name.get(name.lower().strip())

    def get_all_ids(self) -> set[str]:
        return set(self._by_id.keys())

    def filter_exercises(
        self,
        muscle: str | None = None,
        available_equipment: list[str] | None = None,
        difficulty: ExperienceLevel | None = None,
        excluded_names_or_ids: list[str] | None = None,
        limitations: list[str] | None = None,
    ) -> list[ExerciseItemGrounding]:
        """Filter catalog exercises matching user equipment, muscle, and safety exclusions."""
        if isinstance(muscle, list) and available_equipment is None:
            available_equipment = muscle
            muscle = None

        excluded_set = {x.lower().strip() for x in (excluded_names_or_ids or [])}
        norm_equipment: set[str] | None = None
        if available_equipment:
            norm_equipment = {eq.lower().strip() for eq in available_equipment}
            norm_equipment.add("bodyweight")
            norm_equipment.add("none")
            if "cable_machine" in norm_equipment or "machine" in norm_equipment:
                norm_equipment.add("cable_machine")
                norm_equipment.add("machine")

        results: list[ExerciseItemGrounding] = []
        for ex in self._catalog:
            # Check exclusions
            if ex.id in excluded_set or ex.name.lower() in excluded_set:
                continue

            # Check muscle match
            if muscle:
                muscle_lower = muscle.lower()
                all_muscles = [m.lower() for m in ex.primary_muscles + ex.secondary_muscles]
                if not any(muscle_lower in m or m in muscle_lower for m in all_muscles):
                    continue

            # Check equipment match
            if norm_equipment is not None:
                ex_equip = ex.equipment.lower()
                is_compat = (
                    "bodyweight" in ex_equip
                    or "none" in ex_equip
                    or any(eq in ex_equip or ex_equip in eq for eq in norm_equipment)
                )
                if not is_compat:
                    continue

            # Check limitation keywords
            if limitations:
                ex_name_lower = ex.name.lower()
                skip = False
                for lim in limitations:
                    lim_lower = lim.lower()
                    knee_kws = ["barbell squat", "jumping lunge", "box jump"]
                    if "knee" in lim_lower and any(k in ex_name_lower for k in knee_kws):
                        skip = True
                        break
                    shoulder_kws = ["behind the neck", "upright row"]
                    if "shoulder" in lim_lower and any(k in ex_name_lower for k in shoulder_kws):
                        skip = True
                        break
                    back_kws = ["deadlift", "good morning"]
                    if "back" in lim_lower and any(k in ex_name_lower for k in back_kws):
                        skip = True
                        break
                if skip:
                    continue

            results.append(ex)
        return results

    def find_alternatives(
        self,
        target_exercise_id: str,
        available_equipment: list[str] | None = None,
        limitations: list[str] | None = None,
        max_alternatives: int = 2,
    ) -> list[ExerciseAlternative]:
        """Find suitable grounded alternatives for a specific exercise."""
        target = self.get_by_id(target_exercise_id)
        if not target:
            return []

        primary_muscle = target.primary_muscles[0] if target.primary_muscles else None
        candidates = self.filter_exercises(
            muscle=primary_muscle,
            available_equipment=available_equipment,
            excluded_names_or_ids=[target.id, target.name],
            limitations=limitations,
        )

        alternatives: list[ExerciseAlternative] = []
        for cand in candidates[:max_alternatives]:
            alternatives.append(
                ExerciseAlternative(
                    exercise_id=cand.id,
                    name=cand.name,
                    equipment=cand.equipment,
                    reason=f"Target {primary_muscle} with compatible {cand.equipment} equipment",
                )
            )
        return alternatives
