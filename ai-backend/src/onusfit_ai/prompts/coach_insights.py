"""AI Coach insights prompt, ported 1:1 from the former Node GeminiCoachInsightsService.

tests/fixtures/coach_insights/prompt_cases.json holds the exact prompts the Node code produced for
nine synthetic contexts in every language; tests/test_coach_insights_prompt.py compares against them.
To change the wording on purpose, bump PROMPT_VERSION and regenerate the fixture in the same change.
"""

from onusfit_ai.contracts.coach_chat import UserFitnessContext
from onusfit_ai.core.js_compat import js_nullish, js_num

PROMPT_VERSION = "coach_insights_v1_node_parity"

_TA = "CRITICAL: Respond STRICTLY in Tamil (தமிழ் script). Keep terms like calories, protein, workout easy to understand."
_TANGLISH = 'CRITICAL: Respond STRICTLY in Tanglish (Tamil words written in English letters, e.g. "Kcal intake reach pannunga", "Rest day romba mukkiyam").'
_EN = "Respond in clean, encouraging English."

_INSTRUCTIONS = """STRICT INSTRUCTIONS:
1. Generate exactly 2 or 3 insights covering:
   - Workout consistency or progression
   - Nutrition / protein progress
   - Hydration or recovery suggestion (ONLY if backed by actual data above)
2. NEVER invent missing wearable metrics (no fake sleep stages, fake HRV, fake steps).
3. Do not give medical diagnoses or medication advice.
4. Output STRICTLY VALID JSON without markdown fences matching this schema:
{
  "greeting": "Personalized greeting like 'Good morning, Alex!'",
  "recommendation": "Short 1-sentence action recommendation for today",
  "insights": [
    {
      "id": "ins-1",
      "title": "Short punchy headline (max 50 chars)",
      "description": "1-2 sentence evidence-based guidance (max 160 chars)",
      "category": "workout",
      "priority": "high",
      "severity": "positive",
      "action": "View Workout",
      "question": "What should I focus on for today's workout?",
      "evidence": ["Chest + Triceps scheduled"],
      "confidence": "high",
      "requiresDevice": false
    }
  ]
}"""


def build_prompt(context: UserFitnessContext, lang: str | None) -> str:
    profile = context.profile
    today = context.today_nutrition

    language = _TA if lang == "ta" else _TANGLISH if lang == "tanglish" else _EN

    # `latestWeightKg ?? profile.currentWeightKg ?? 'Not set'`
    weight = (
        context.latest_weight_kg
        if context.latest_weight_kg is not None
        else profile.current_weight_kg
    )
    planned = context.today_planned_workout
    planned_text = (
        f"{planned.name} (~{js_num(planned.duration_minutes)} min)" if planned else "None scheduled"
    )
    workouts = (
        "\n".join(
            f"- {w.name}: {js_num(w.duration_minutes)}m, {js_num(w.total_sets)} sets, "
            f"{js_num(w.volume_kg)}kg volume, "
            f"{js_num(w.calories_burned if w.calories_burned is not None else 0)} kcal"
            for w in context.recent_workouts
        )
        if context.recent_workouts
        else "None logged yet"
    )
    goals = (
        "\n".join(
            f"- {g.title}: {js_num(g.current_value)}/{js_num(g.target_value)} {g.unit}"
            for g in context.active_goals
        )
        if context.active_goals
        else "None"
    )

    return f"""You are OnusFit AI Insights Engine — an elite sports scientist and strength coach.
Generate 2 to 3 concise, highly personalized actionable insights based on the user's REAL fitness data.

{language}

USER PROFILE:
- Name: {profile.display_name}
- Goal: {js_nullish(profile.primary_goal, "Fitness & Health")}
- Experience: {js_nullish(profile.experience_level, "Intermediate")}
- Current Weight: {js_nullish(weight, "Not set")} kg
- Daily Targets: Calories {js_nullish(profile.daily_calorie_target, "Not set")} kcal | Protein {js_nullish(profile.daily_protein_grams, "Not set")} g

TODAY'S ACTIVITY & NUTRITION:
- Calories: {js_num(today.calories_consumed)} kcal (Target: {js_nullish(today.calorie_target, "Not set")})
- Protein: {js_num(today.protein_grams)} g (Target: {js_nullish(today.protein_target, "Not set")})
- Water Logged Today: {js_num(today.water_intake_ml)} ml
- Planned Workout Today: {planned_text}

RECENT WORKOUTS:
{workouts}

ACTIVE GOALS:
{goals}

{_INSTRUCTIONS}"""
