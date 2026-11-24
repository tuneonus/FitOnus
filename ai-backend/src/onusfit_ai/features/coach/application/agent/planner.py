"""Goal understanding and bounded task planning for FitOnus AI Agent.

FitOnus Phase 09: AI Agent Fundamentals — Stage 02.
Interprets user intent in English, Tamil, and Tanglish.
Bypasses planning for simple questions and greetings to minimize latency and token spend.
Produces bounded, typed TaskPlans with validated tool arguments.
"""

import re
from typing import Any, Literal

from onusfit_ai.features.coach.domain.agent import (
    AgentBudgetConfig,
    AgentGoal,
    AgentGoalType,
    PlanStep,
    StepAction,
    StepStatus,
    TaskPlan,
)
from onusfit_ai.features.coach.domain.chat import UserFitnessContext
from onusfit_ai.shared.contracts.tools import (
    TOOL_GET_NUTRITION_SUMMARY,
    TOOL_GET_RECENT_WORKOUTS,
    TOOL_GET_WEIGHT_TREND,
    TOOL_SEARCH_EXERCISES,
    GetNutritionSummaryArgs,
    GetRecentWorkoutsArgs,
    GetWeightTrendArgs,
    SearchExercisesArgs,
)

# -----------------------------------------------------------------------------
# Language Detection Patterns
# -----------------------------------------------------------------------------
RE_TAMIL_SCRIPT = re.compile(r"[\u0B80-\u0BFF]")

RE_TANGLISH_KEYWORDS = re.compile(
    r"\b(?:en|enna|indha|panni|sollu|epdi|irukku|paaru|pannu|vanakkam|nanri|nandri|"
    r"valikuthu|mutti|saapadu|unavu|thanni|innaiku|kudu|adutha|venum|aacha|romba|"
    r"seri|eppadi|evlo|evvalo|paruppu|kaikari|thasai|tholpattai|mudhugu|udambu)\b",
    re.IGNORECASE,
)

# -----------------------------------------------------------------------------
# Greetings and Simple Pleasantries
# -----------------------------------------------------------------------------
RE_PURE_GREETING_EN = re.compile(
    r"^(?:(?:hi|hello|hey|good\s+(?:morning|afternoon|evening|day)|"
    r"thanks?(?:\s+(?:so\s+much|a\s+lot|you))?|thank\s+you(?:\s+so\s+much|\s+very\s+much)?|"
    r"thx|ty|bye|goodbye|cya|ok|okay|cool|awesome|great|cheers|sup|yo)"
    r"(?:[\s,]+(?:coach|bye|thanks|thank\s+you|ok|okay))?)(?:[!?.\s]*)$",
    re.IGNORECASE,
)

RE_PURE_GREETING_TA = re.compile(
    r"^(?:வணக்கம்|நன்றி|சரி|காலை\s*வணக்கம்|மாலை\s*வணக்கம்|சூப்பர்|"
    r"வணக்கம்க்கா|வணக்கம்பா|ரொம்ப\s*நன்றி)(?:[\s!?.]*)$",
    re.UNICODE,
)

RE_PURE_GREETING_TL = re.compile(
    r"^(?:vanakkam|nanri|nandri|kaalai\s*vanakkam|romba\s*nanri|seri|super|mikka\s*nanri)"
    r"(?:[\s,]+coach)?(?:[!?.\s]*)$",
    re.IGNORECASE,
)

# -----------------------------------------------------------------------------
# Simple Local Metric Lookups (bypasses agent tool execution)
# -----------------------------------------------------------------------------
RE_SIMPLE_LOCAL_LOOKUP_EN = re.compile(
    r"^(?:what\s+is\s+my\s+(?:current\s+)?weight|how\s+much\s+do\s+i\s+weigh|"
    r"how\s+much\s+water\s+(?:did\s+i\s+drink|today)|water\s+intake\s+today|"
    r"today'?s\s+calories|how\s+many\s+calories\s+today|calorie\s+target|"
    r"protein\s+target|my\s+primary\s+goal|target\s+weight)(?:[!?.\s]*)$",
    re.IGNORECASE,
)

RE_SIMPLE_LOCAL_LOOKUP_TA = re.compile(
    r"^(?:இன்றைய\s*தண்ணீர்\s*அளவு|என்\s*எடை\s*என்ன|இன்றைய\s*கலோரி|இலக்கு\s*எடை)"
    r"(?:[!?.\s]*)$",
    re.UNICODE,
)

RE_SIMPLE_LOCAL_LOOKUP_TL = re.compile(
    r"^(?:enna\s+weight|current\s+weight\s+enna|innaiku\s+thanni\s+evlo|"
    r"innaiku\s+calorie\s+evlo|target\s+weight\s+enna)(?:[!?.\s]*)$",
    re.IGNORECASE,
)

# -----------------------------------------------------------------------------
# Goal Intent Classification Patterns
# -----------------------------------------------------------------------------
RE_FITNESS_PROGRESS = re.compile(
    r"\b(?:fitness\s+progress|check\s+my\s+progress|overall\s+progress|progress\s+review|"
    r"how\s+am\s+i\s+doing|weekly\s+review|progress\s+check|"
    r"முன்னேற்றம்|முன்னேற்றத்தை|எப்படி\s*உள்ளது|"
    r"progress\s+check\s+panni|progress\s+epdi|progress\s+review|improve\s+pannanum)\b",
    re.IGNORECASE | re.UNICODE,
)

RE_WORKOUT_ANALYSIS = re.compile(
    r"\b(?:workout\s+history|recent\s+workouts|past\s+workouts|workout\s+logs?|"
    r"workout\s+sessions?|training\s+logs?|exercises\s+done|what\s+did\s+i\s+lift|sessions\s+completed|"
    r"உடற்பயிற்சி\s*வரலாறு|செய்த\s*பயிற்சிகள்|கடந்த\s*வார\s*பயிற்சி|"
    r"workout\s+history|workout\s+enna\s+pannen|workout\s+paaru|sessions\s+evlo)\b",
    re.IGNORECASE | re.UNICODE,
)

RE_NUTRITION_ANALYSIS = re.compile(
    r"\b(?:nutrition\s+summary|past\s+diet|diet\s+and\s+protein|diet\s+history|diet\s+summary|"
    r"nutrition\s+logs?|weekly\s+nutrition|macros\s+history|protein\s+intake|caloric\s+adherence|"
    r"eating\s+history|caloric\s+intake|"
    r"உணவு\s*முறை|உணவு\s*சுருக்கம்|புரத\s*அளவு\s*கடந்த|"
    r"protein\s+target\s+reach)\b",
    re.IGNORECASE | re.UNICODE,
)

RE_WEIGHT_TREND = re.compile(
    r"\b(?:weight\s+trend|weight\s+loss\s+trend|weight\s+change|weight\s+trended|"
    r"weight\s+over\s+time|body\s+weight\s+graph|weight\s+history|weight\s+logs?|"
    r"எடை\s*போக்கு|எடை\s*மாற்றம்|எடை\s*வரலாறு|"
    r"weight\s+reduce\s+aairukka|weight\s+change\s+epdi)\b",
    re.IGNORECASE | re.UNICODE,
)

RE_EXERCISE_SEARCH = re.compile(
    r"\b(?:suggest\s+(?:an?\s+)?exercise|exercise\s+for|alternative\s+for|substitute\s+for|"
    r"how\s+to\s+train\s+(?:chest|back|quads|hamstrings|shoulders|biceps|triceps)|"
    r"exercises?\s+with\s+(?:dumbbells?|barbell|cable|bodyweight)|"
    r"உடற்பயிற்சி\s*பரிந்துரை|பயிற்சி\s*சொல்|மாற்று\s*பயிற்சி|"
    r"exercise\s+sollu|workout\s+sollu|alternative\s+exercise|exercise\s+thedu)\b",
    re.IGNORECASE | re.UNICODE,
)

RE_COMBINED_RECOMMENDATIONS = re.compile(
    r"\b(?:what\s+should\s+i\s+improve|how\s+to\s+improve\s+this\s+week|"
    r"recommendations\s+for\s+next\s+week|next\s+week\s+plan|routine\s+optimization|"
    r"அடுத்த\s*வாரம்\s*என்ன\s*செய்ய\s*வேண்டும்|வழக்கத்தை\s*மேம்படுத்து|"
    r"indha\s+week\s+enna\s+improve|adutha\s+week\s+plan|routine\s+improve)\b",
    re.IGNORECASE | re.UNICODE,
)


def detect_language(text: str) -> Literal["en", "ta", "tanglish"]:
    """Detects primary language: Tamil script, Tanglish (Latin script Tamil), or English."""
    if RE_TAMIL_SCRIPT.search(text):
        return "ta"
    if RE_TANGLISH_KEYWORDS.search(text):
        return "tanglish"
    return "en"


def _extract_days(text: str, default_days: int, min_val: int = 1, max_val: int = 90) -> int:
    """Extracts explicit day bounds mentioned in text (e.g. 'past 14 days', 'last 2 weeks')."""
    # Weeks check: "2 weeks" -> 14 days
    week_match = re.search(r"(\d+)\s*(?:weeks?|வாரம்|vaaram)", text, re.IGNORECASE)
    if week_match:
        try:
            val = int(week_match.group(1)) * 7
            return max(min_val, min(max_val, val))
        except ValueError:
            pass

    # Days check: "10 days" -> 10 days
    day_match = re.search(r"(\d+)\s*(?:days?|நாட்கள்|naal|naala)", text, re.IGNORECASE)
    if day_match:
        try:
            val = int(day_match.group(1))
            return max(min_val, min(max_val, val))
        except ValueError:
            pass

    # Month check: "1 month" / "past month" -> 30 days
    if re.search(r"(?:month|மாதம்|maasam)", text, re.IGNORECASE):
        return min(max_val, max(min_val, 30))

    return default_days


def _extract_exercise_search_query(text: str) -> dict[str, Any]:
    """Extracts target muscle, equipment, and search query for exercise search."""
    muscle = None
    equipment = None

    # Muscle detection
    muscle_map = {
        "chest": ["chest", "pectoral", "மார்பு", "mâarbu"],
        "back": ["back", "lats", "முதுகு", "mudhugu"],
        "shoulders": ["shoulder", "deltoid", "தோள்பட்டை", "tholpattai"],
        "quadriceps": ["quad", "quadriceps", "முடை", "mutti"],
        "hamstrings": ["hamstring", "தொடை"],
        "biceps": ["bicep", "biceps"],
        "triceps": ["tricep", "triceps"],
        "abs": ["abs", "core", "வயிறு"],
    }
    for m, keywords in muscle_map.items():
        for kw in keywords:
            if re.search(r"\b" + re.escape(kw) + r"\b", text, re.IGNORECASE):
                muscle = m
                break
        if muscle:
            break

    # Equipment detection
    equip_map = {
        "dumbbell": ["dumbbell", "dumbbells"],
        "barbell": ["barbell", "barbells"],
        "cable": ["cable", "cables"],
        "bodyweight": ["bodyweight", "no equipment", "home"],
    }
    for eq, keywords in equip_map.items():
        for kw in keywords:
            if re.search(r"\b" + re.escape(kw) + r"\b", text, re.IGNORECASE):
                equipment = eq
                break
        if equipment:
            break

    # Fallback search query
    query = muscle or "strength"
    # Look for common exercise names in inquiry
    common_exercises = ["squat", "bench press", "deadlift", "push up", "pull up", "lunge"]
    for ex in common_exercises:
        if ex in text.lower():
            query = ex
            break

    return {
        "query": query,
        "muscle": muscle,
        "equipment": equipment,
        "limit": 5,
    }


class AgentPlanner:
    """Analyzes user goal, selects relevant tools, and creates a bounded task plan."""

    def __init__(self, budget: AgentBudgetConfig | None = None) -> None:
        self._budget = budget or AgentBudgetConfig()

    def interpret_goal(
        self,
        message: str,
        context: UserFitnessContext,
    ) -> AgentGoal:
        """Interprets the user inquiry into a typed AgentGoal."""
        trimmed = message.strip()
        lang = detect_language(trimmed)

        # 1. Pure Greeting Bypass
        if (
            RE_PURE_GREETING_EN.match(trimmed)
            or RE_PURE_GREETING_TA.match(trimmed)
            or RE_PURE_GREETING_TL.match(trimmed)
        ):
            return AgentGoal(
                goal_type=AgentGoalType.GREETING,
                target_description="Greeting or conversational pleasantry",
                language=lang,
                requires_agent_execution=False,
                confidence=1.0,
                target_domains=[],
            )

        # 2. Simple Local Metric Lookup Bypass
        if (
            RE_SIMPLE_LOCAL_LOOKUP_EN.match(trimmed)
            or RE_SIMPLE_LOCAL_LOOKUP_TA.match(trimmed)
            or RE_SIMPLE_LOCAL_LOOKUP_TL.match(trimmed)
        ):
            return AgentGoal(
                goal_type=AgentGoalType.SIMPLE_QA,
                target_description="Direct inquiry about current local fitness metrics",
                language=lang,
                requires_agent_execution=False,
                confidence=0.95,
                target_domains=[],
            )

        # 3. Fitness Progress Analysis
        if RE_FITNESS_PROGRESS.search(trimmed):
            return AgentGoal(
                goal_type=AgentGoalType.FITNESS_PROGRESS,
                target_description=(
                    "Comprehensive fitness progress analysis across workouts, "
                    "nutrition, and weight trajectory"
                ),
                language=lang,
                requires_agent_execution=True,
                confidence=0.95,
                target_domains=["workouts", "nutrition", "weight"],
            )

        # 4. Workout History Analysis
        if RE_WORKOUT_ANALYSIS.search(trimmed):
            return AgentGoal(
                goal_type=AgentGoalType.WORKOUT_ANALYSIS,
                target_description="Historical workout session and training volume review",
                language=lang,
                requires_agent_execution=True,
                confidence=0.90,
                target_domains=["workouts"],
            )

        # 5. Nutrition Analysis
        if RE_NUTRITION_ANALYSIS.search(trimmed):
            return AgentGoal(
                goal_type=AgentGoalType.NUTRITION_ANALYSIS,
                target_description="Historical dietary intake and macronutrient adherence review",
                language=lang,
                requires_agent_execution=True,
                confidence=0.90,
                target_domains=["nutrition"],
            )

        # 6. Weight Trend Analysis
        if RE_WEIGHT_TREND.search(trimmed):
            return AgentGoal(
                goal_type=AgentGoalType.WEIGHT_TREND,
                target_description="Historical weight log trend and progress towards target weight",
                language=lang,
                requires_agent_execution=True,
                confidence=0.90,
                target_domains=["weight"],
            )

        # 7. Exercise Search
        if RE_EXERCISE_SEARCH.search(trimmed):
            return AgentGoal(
                goal_type=AgentGoalType.EXERCISE_SEARCH,
                target_description="Search verified exercise catalog for muscle/equipment",
                language=lang,
                requires_agent_execution=True,
                confidence=0.90,
                target_domains=["exercises"],
            )

        # 8. Combined Fitness Recommendations
        if RE_COMBINED_RECOMMENDATIONS.search(trimmed):
            return AgentGoal(
                goal_type=AgentGoalType.COMBINED_RECOMMENDATIONS,
                target_description="Combined fitness recommendations based on history",
                language=lang,
                requires_agent_execution=True,
                confidence=0.85,
                target_domains=["workouts", "nutrition"],
            )

        # Default fallback: treat as simple QA unless specific tools are clearly helpful
        return AgentGoal(
            goal_type=AgentGoalType.SIMPLE_QA,
            target_description="General fitness coaching query",
            language=lang,
            requires_agent_execution=False,
            confidence=0.75,
            target_domains=[],
        )

    def create_plan(
        self,
        goal: AgentGoal,
        user_message: str,
        context: UserFitnessContext,
    ) -> TaskPlan:
        """Creates a bounded, step-by-step TaskPlan tailored to the AgentGoal."""
        steps: list[PlanStep] = []
        step_id = 1

        if not goal.requires_agent_execution:
            return TaskPlan(goal=goal, steps=[], estimated_iterations=0)

        # Bounded days calculation
        workout_days = _extract_days(user_message, default_days=7, min_val=1, max_val=90)
        nutrition_days = _extract_days(user_message, default_days=7, min_val=1, max_val=30)
        weight_days = _extract_days(user_message, default_days=30, min_val=1, max_val=90)

        if goal.goal_type == AgentGoalType.FITNESS_PROGRESS:
            # 1. Recent workouts
            steps.append(
                PlanStep(
                    step_id=step_id,
                    description=f"Retrieve past {workout_days} days of workouts to evaluate volume",
                    action=StepAction(
                        tool_name=TOOL_GET_RECENT_WORKOUTS,
                        args=GetRecentWorkoutsArgs(days=workout_days).model_dump(exclude_none=True),
                        rationale="Analyze completed training sessions and physical strain",
                    ),
                    status=StepStatus.PENDING,
                )
            )
            step_id += 1

            # 2. Nutrition summary
            steps.append(
                PlanStep(
                    step_id=step_id,
                    description=f"Retrieve past {nutrition_days} days of nutrition summary",
                    action=StepAction(
                        tool_name=TOOL_GET_NUTRITION_SUMMARY,
                        args=GetNutritionSummaryArgs(days=nutrition_days).model_dump(
                            exclude_none=True
                        ),
                        rationale="Analyze dietary intake and nutritional balance",
                    ),
                    status=StepStatus.PENDING,
                )
            )
            step_id += 1

            # 3. Weight trend
            steps.append(
                PlanStep(
                    step_id=step_id,
                    description=f"Retrieve past {weight_days} days of weight logs to measure mass",
                    action=StepAction(
                        tool_name=TOOL_GET_WEIGHT_TREND,
                        args=GetWeightTrendArgs(days=weight_days).model_dump(exclude_none=True),
                        rationale="Analyze body mass changes relative to goals",
                    ),
                    status=StepStatus.PENDING,
                )
            )
            step_id += 1

        elif goal.goal_type == AgentGoalType.WORKOUT_ANALYSIS:
            steps.append(
                PlanStep(
                    step_id=step_id,
                    description=f"Retrieve past {workout_days} days of workout sessions",
                    action=StepAction(
                        tool_name=TOOL_GET_RECENT_WORKOUTS,
                        args=GetRecentWorkoutsArgs(days=workout_days).model_dump(exclude_none=True),
                        rationale="Evaluate exercise selection, sets, reps, and training volume",
                    ),
                    status=StepStatus.PENDING,
                )
            )
            step_id += 1

        elif goal.goal_type == AgentGoalType.NUTRITION_ANALYSIS:
            steps.append(
                PlanStep(
                    step_id=step_id,
                    description=f"Retrieve past {nutrition_days} days of nutrition logs",
                    action=StepAction(
                        tool_name=TOOL_GET_NUTRITION_SUMMARY,
                        args=GetNutritionSummaryArgs(days=nutrition_days).model_dump(
                            exclude_none=True
                        ),
                        rationale="Evaluate daily calories, protein, carbs, and water intake",
                    ),
                    status=StepStatus.PENDING,
                )
            )
            step_id += 1

        elif goal.goal_type == AgentGoalType.WEIGHT_TREND:
            steps.append(
                PlanStep(
                    step_id=step_id,
                    description=f"Retrieve past {weight_days} days of weight logs",
                    action=StepAction(
                        tool_name=TOOL_GET_WEIGHT_TREND,
                        args=GetWeightTrendArgs(days=weight_days).model_dump(exclude_none=True),
                        rationale="Analyze rate of weight gain or loss against target goal",
                    ),
                    status=StepStatus.PENDING,
                )
            )
            step_id += 1

        elif goal.goal_type == AgentGoalType.EXERCISE_SEARCH:
            search_params = _extract_exercise_search_query(user_message)
            steps.append(
                PlanStep(
                    step_id=step_id,
                    description=f"Search exercise catalog for query '{search_params['query']}'",
                    action=StepAction(
                        tool_name=TOOL_SEARCH_EXERCISES,
                        args=SearchExercisesArgs(**search_params).model_dump(exclude_none=True),
                        rationale="Retrieve verified exercise options matching user preferences",
                    ),
                    status=StepStatus.PENDING,
                )
            )
            step_id += 1

        elif goal.goal_type == AgentGoalType.COMBINED_RECOMMENDATIONS:
            steps.append(
                PlanStep(
                    step_id=step_id,
                    description=f"Retrieve past {workout_days} days of workout history",
                    action=StepAction(
                        tool_name=TOOL_GET_RECENT_WORKOUTS,
                        args=GetRecentWorkoutsArgs(days=workout_days).model_dump(exclude_none=True),
                        rationale="Review recent training stimulus",
                    ),
                    status=StepStatus.PENDING,
                )
            )
            step_id += 1
            steps.append(
                PlanStep(
                    step_id=step_id,
                    description=f"Retrieve past {nutrition_days} days of nutrition summary",
                    action=StepAction(
                        tool_name=TOOL_GET_NUTRITION_SUMMARY,
                        args=GetNutritionSummaryArgs(days=nutrition_days).model_dump(
                            exclude_none=True
                        ),
                        rationale="Review dietary fuel and recovery adequacy",
                    ),
                    status=StepStatus.PENDING,
                )
            )
            step_id += 1

        # Enforce budget max planning steps
        capped_steps = steps[: self._budget.max_planning_steps]
        return TaskPlan(
            goal=goal,
            steps=capped_steps,
            estimated_iterations=1 if len(capped_steps) <= 3 else 2,
        )
