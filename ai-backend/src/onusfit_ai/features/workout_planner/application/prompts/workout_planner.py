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
    from onusfit_ai.shared.utils.guardrails import sanitize_untrusted_text

    safe_goal = sanitize_untrusted_text(goal)
    safe_exp = sanitize_untrusted_text(experience_level)
    safe_env = sanitize_untrusted_text(environment)
    safe_lang = sanitize_untrusted_text(language)
    safe_equip = [sanitize_untrusted_text(item) for item in available_equipment]
    safe_limits = [sanitize_untrusted_text(item) for item in physical_limitations]
    safe_targets = [sanitize_untrusted_text(item) for item in (target_muscles or [])]
    safe_pref = [sanitize_untrusted_text(item) for item in (preferred_exercises or [])]
    safe_excl = [sanitize_untrusted_text(item) for item in (excluded_exercises or [])]
    prompt = f"""Generate a {days_per_week}-day weekly workout plan tailored to the following user profile:

**User Profile & Constraints:**
- Goal: {safe_goal}
- Experience Level: {safe_exp}
- Available Equipment: {", ".join(safe_equip) if safe_equip else "Bodyweight only"}
- Training Frequency: {days_per_week} days per week
- Target Session Duration: {session_duration_minutes} minutes
- Environment: {safe_env}
- Physical Limitations / Injuries: {", ".join(safe_limits) if safe_limits else "None reported"}
- Preferred Target Muscles: {", ".join(safe_targets) if safe_targets else "Balanced full body"}
- Preferred Exercises: {", ".join(safe_pref) if safe_pref else "None"}
- Excluded Exercises: {", ".join(safe_excl) if safe_excl else "None"}
- Output Language: {safe_lang}
"""
    if recent_training_summary:
        prompt += f"\n**Recent Workout Performance:**\n{sanitize_untrusted_text(recent_training_summary)}\n"

    if rag_context:
        safe_rag = [sanitize_untrusted_text(chunk) for chunk in rag_context]
        prompt += "\n**Evidence & Knowledge Excerpts:**\n" + "\n---\n".join(safe_rag) + "\n"

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
    from onusfit_ai.shared.utils.guardrails import sanitize_untrusted_text

    safe_missed = [sanitize_untrusted_text(item) for item in missed_sessions]
    safe_new_equip = [sanitize_untrusted_text(item) for item in (new_equipment or [])]
    safe_diff = sanitize_untrusted_text(difficulty_feedback) if difficulty_feedback else "None"
    safe_feedback = sanitize_untrusted_text(user_feedback) if user_feedback else "None"
    safe_lang = sanitize_untrusted_text(language)
    prompt = f"""Adapt the existing weekly workout plan based on dynamic changes and user feedback.

**Current Active Plan:**
{current_plan_json}

**Adaptation Triggers:**
- Missed Sessions: {", ".join(safe_missed) if safe_missed else "None"}
- Reduced Duration: {f"{reduced_duration_minutes} minutes" if reduced_duration_minutes else "Unchanged"}
- Updated Equipment: {", ".join(safe_new_equip) if safe_new_equip else "Unchanged"}
- Difficulty Feedback: {safe_diff}
- User Feedback: {safe_feedback}
- Recovery Score: {f"{recovery_score}/100" if recovery_score is not None else "Not provided"}
- Output Language: {safe_lang}

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
