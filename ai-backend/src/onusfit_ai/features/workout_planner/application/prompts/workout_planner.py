"""Prompts and instruction templates for AI workout plan generation and adaptation."""

WORKOUT_PLANNER_SYSTEM_PROMPT = """You are the FitOnus Master Strength & Conditioning Coach and Clinical Exercise Physiologist.
Your role is to design safe, personalized, progressive, and highly effective workout routines grounded in evidence-based exercise science.

### Non-Negotiable Grounding Rules:
1. EVERY prescribed exercise MUST match an exact exercise provided in the available catalog list with its exact `exercise_id` and name.
2. NEVER invent, hallucinate, or fabricate an `exercise_id` or exercise name.
3. STRICTLY respect available equipment. Never prescribe barbell movements if the user only has dumbbells or bodyweight.
4. STRICTLY respect reported physical limitations and injuries. Avoid contraindicated exercises (e.g. no heavy squats for knee pain, no behind-neck presses for shoulder issues, no deadlifts for back injuries).
5. For medical red flags (acute sharp pain, chest pain, fractures, dizziness), DO NOT prescribe risky exercises; instead prescribe gentle recovery mobility and clearly advise medical clearance.
6. Design appropriate rest periods: 90-180s for Strength, 60-90s for Hypertrophy/Muscle, 30-60s for Fat Loss / Endurance.
7. Limit total working sets per session: Beginner <= 18 sets, Intermediate <= 24 sets, Advanced <= 30 sets.
8. Include at least 1-2 scheduled recovery days per week.
9. Pre-calculate 1-2 grounded alternatives for primary compound movements.

### Multilingual Support:
- If the requested language is 'ta' (Tamil), write plan titles, descriptions, focus notes, and rationales in clear Tamil while keeping `exercise_id` and numbers identical.
- If the requested language is 'tanglish', write natural conversational Tanglish (Tamil written in Latin script) for titles, notes, and rationales.
- If 'en' (English), respond in professional fitness English.
"""


def build_workout_generation_user_prompt(
    goal: str,
    experience_level: str,
    available_equipment: list[str],
    days_per_week: int,
    session_duration_minutes: int,
    environment: str,
    physical_limitations: list[str],
    catalog_exercises_summary: str,
    target_muscles: list[str] | None = None,
    preferred_exercises: list[str] | None = None,
    excluded_exercises: list[str] | None = None,
    recent_training_summary: str | None = None,
    rag_context: list[str] | None = None,
    language: str = "en",
) -> str:
    prompt = f"""Generate a {days_per_week}-day weekly workout plan tailored to the following user profile:

**User Profile & Constraints:**
- Goal: {goal}
- Experience Level: {experience_level}
- Available Equipment: {", ".join(available_equipment) if available_equipment else "Bodyweight only"}
- Training Frequency: {days_per_week} days per week
- Target Session Duration: {session_duration_minutes} minutes
- Environment: {environment}
- Physical Limitations / Injuries: {", ".join(physical_limitations) if physical_limitations else "None reported"}
- Preferred Target Muscles: {", ".join(target_muscles) if target_muscles else "Balanced full body"}
- Preferred Exercises: {", ".join(preferred_exercises) if preferred_exercises else "None"}
- Excluded Exercises: {", ".join(excluded_exercises) if excluded_exercises else "None"}
- Output Language: {language}
"""
    if recent_training_summary:
        prompt += f"\n**Recent Workout Performance:**\n{recent_training_summary}\n"

    if rag_context:
        prompt += "\n**Evidence & Knowledge Excerpts:**\n" + "\n---\n".join(rag_context) + "\n"

    prompt += f"\n**Available Catalog Exercises (ONLY choose from this list):**\n{catalog_exercises_summary}\n"
    prompt += "\nRespond strictly with the structured WeeklyWorkoutSchedule schema."
    return prompt


def build_workout_adaptation_user_prompt(
    current_plan_json: str,
    missed_sessions: list[str],
    reduced_duration_minutes: int | None = None,
    new_equipment: list[str] | None = None,
    difficulty_feedback: str | None = None,
    user_feedback: str | None = None,
    recovery_score: float | None = None,
    catalog_exercises_summary: str = "",
    language: str = "en",
) -> str:
    prompt = f"""Adapt the existing weekly workout plan based on dynamic changes and user feedback.

**Current Active Plan:**
{current_plan_json}

**Adaptation Triggers:**
- Missed Sessions: {", ".join(missed_sessions) if missed_sessions else "None"}
- Reduced Duration: {f"{reduced_duration_minutes} minutes" if reduced_duration_minutes else "Unchanged"}
- Updated Equipment: {", ".join(new_equipment) if new_equipment else "Unchanged"}
- Difficulty Feedback: {difficulty_feedback or "None"}
- User Feedback: {user_feedback or "None"}
- Recovery Score: {f"{recovery_score}/100" if recovery_score is not None else "Not provided"}
- Output Language: {language}

**Adaptation Guidelines:**
1. Preserve unaffected days and exercises wherever possible.
2. If time was reduced, trim accessory or non-essential sets first; preserve key compound lifts.
3. If recovery score is low (< 50) or user reported 'too_hard', reduce volume and increase rest.
4. If equipment changed, substitute affected movements using the available catalog exercises.
5. Do NOT increase intensity unless recovery and completion history explicitly support it.
"""
    if catalog_exercises_summary:
        prompt += f"\n**Available Catalog Exercises:**\n{catalog_exercises_summary}\n"

    prompt += "\nRespond strictly with the updated WeeklyWorkoutSchedule schema."
    return prompt
