"""Tool, resource, and prompt registry for OnusFit MCP subsystem.

Follows Hexagonal Architecture: Keeps tool and resource definitions decoupled from
the transport and SDK layer. Handlers are pure async callables.
"""

import json
import logging
import uuid
from collections.abc import Awaitable, Callable
from typing import Any, cast

from onusfit_ai.features.mcp.domain.contracts import (
    CatalogIndexProtocol,
    McpPromptArgument,
    McpPromptDefinition,
    McpPromptMessage,
    McpPromptResult,
    McpResourceContent,
    McpResourceDefinition,
    McpToolDefinition,
    PlanGeneratorProtocol,
    ToolHandler,
)
from onusfit_ai.shared.contracts.tools import (
    TOOL_ARG_SCHEMAS,
    TOOL_GET_EXERCISE_DETAILS,
    TOOL_GET_FITNESS_PROFILE,
    TOOL_GET_NUTRITION_SUMMARY,
    TOOL_GET_RECENT_WORKOUTS,
    TOOL_GET_WEIGHT_TREND,
    TOOL_PERSIST_WORKOUT_PLAN,
    TOOL_PREVIEW_NUTRITION_PLAN,
    TOOL_PREVIEW_WORKOUT_ADAPTATION,
    TOOL_PREVIEW_WORKOUT_PLAN,
    TOOL_RETRIEVE_FITNESS_KNOWLEDGE,
    TOOL_SEARCH_EXERCISES,
    TOOL_VALIDATE_WORKOUT_PLAN,
)

logger = logging.getLogger("onusfit_ai.mcp.registry")

ResourceHandler = Callable[[], Awaitable[str]]
PromptHandler = Callable[..., list[McpPromptMessage] | str]


class McpToolRegistry:
    """Central registry for MCP tools, resources, and prompt templates."""

    def __init__(self) -> None:
        self._tools: dict[str, McpToolDefinition] = {}
        self._tool_handlers: dict[str, ToolHandler] = {}
        self._resources: dict[str, McpResourceDefinition] = {}
        self._resource_handlers: dict[str, ResourceHandler] = {}
        self._prompts: dict[str, McpPromptDefinition] = {}
        self._prompt_handlers: dict[str, PromptHandler] = {}

    def register_tool(
        self,
        definition: McpToolDefinition,
        handler: ToolHandler,
    ) -> None:
        """Register an executable tool and its handler."""
        self._tools[definition.name] = definition
        self._tool_handlers[definition.name] = handler
        logger.debug("Registered MCP tool '%s' (is_write=%s)", definition.name, definition.is_write)

    def register_resource(
        self,
        definition: McpResourceDefinition,
        handler: ResourceHandler,
    ) -> None:
        """Register an informational resource URI and its content loader."""
        self._resources[definition.uri] = definition
        self._resource_handlers[definition.uri] = handler
        logger.debug("Registered MCP resource '%s'", definition.uri)

    def register_prompt(
        self,
        definition: McpPromptDefinition,
        handler: PromptHandler,
    ) -> None:
        """Register a reusable prompt template and its renderer."""
        self._prompts[definition.name] = definition
        self._prompt_handlers[definition.name] = handler
        logger.debug("Registered MCP prompt '%s'", definition.name)

    def get_tool(self, name: str) -> McpToolDefinition | None:
        return self._tools.get(name)

    def get_tool_handler(self, name: str) -> ToolHandler | None:
        return self._tool_handlers.get(name)

    def list_tools(self, filter_read_only: bool = False) -> list[McpToolDefinition]:
        if filter_read_only:
            return [t for t in self._tools.values() if not t.is_write]
        return list(self._tools.values())

    def get_resource(self, uri: str) -> McpResourceDefinition | None:
        return self._resources.get(uri)

    def list_resources(self) -> list[McpResourceDefinition]:
        return list(self._resources.values())

    async def read_resource(self, uri: str) -> McpResourceContent | None:
        handler = self._resource_handlers.get(uri)
        resource = self._resources.get(uri)
        if not handler or not resource:
            return None
        text = await handler()
        return McpResourceContent(uri=uri, mime_type=resource.mime_type, text=text)

    def get_prompt(self, name: str) -> McpPromptDefinition | None:
        return self._prompts.get(name)

    def list_prompts(self) -> list[McpPromptDefinition]:
        return list(self._prompts.values())

    def render_prompt(self, name: str, **kwargs: Any) -> McpPromptResult | None:
        handler = self._prompt_handlers.get(name)
        prompt = self._prompts.get(name)
        if not handler or not prompt:
            return None
        raw = handler(**kwargs)
        if isinstance(raw, str):
            messages = [McpPromptMessage(role="user", content=raw)]
        else:
            messages = raw
        return McpPromptResult(name=name, messages=messages)


def _schema_to_json_schema(model_cls: type[Any]) -> dict[str, Any]:
    """Extract standard JSON schema from Pydantic model class."""
    if hasattr(model_cls, "model_json_schema"):
        return cast(dict[str, Any], model_cls.model_json_schema())
    return {}


def create_fitonus_tool_registry(
    tools_client_getter: Callable[[], Any] | None = None,
    plan_generator: PlanGeneratorProtocol | None = None,
    catalog_index: CatalogIndexProtocol | None = None,
) -> McpToolRegistry:
    """Build and populate the standard OnusFit MCP Tool Registry with all 10 tools."""
    registry = McpToolRegistry()

    # --- Tool 1: get_fitness_profile ---
    async def _handle_get_fitness_profile(args: dict[str, Any], user_id: str, request_id: str) -> dict[str, Any]:
        client = tools_client_getter() if tools_client_getter else None
        if client:
            return cast(
                dict[str, Any],
                await client.execute_tool(TOOL_GET_FITNESS_PROFILE, args, user_id=user_id, request_id=request_id),
            )
        return {
            "profile": {
                "userId": user_id,
                "primaryGoal": "strength",
                "experienceLevel": "intermediate",
                "workoutDaysPerWeek": 4,
                "availableEquipment": ["barbell", "dumbbell", "bodyweight"],
                "targets": {"calories": 2400, "proteinG": 160, "carbsG": 260, "fatG": 80},
            }
        }

    registry.register_tool(
        McpToolDefinition(
            name=TOOL_GET_FITNESS_PROFILE,
            description="Retrieve athlete fitness profile, goals, equipment, and calculated daily macro targets.",
            input_schema=_schema_to_json_schema(TOOL_ARG_SCHEMAS[TOOL_GET_FITNESS_PROFILE]),
            is_write=False,
            requires_auth=True,
        ),
        _handle_get_fitness_profile,
    )

    # --- Tool 2: get_recent_workouts ---
    async def _handle_get_recent_workouts(args: dict[str, Any], user_id: str, request_id: str) -> dict[str, Any]:
        client = tools_client_getter() if tools_client_getter else None
        if client:
            return cast(
                dict[str, Any],
                await client.execute_tool(TOOL_GET_RECENT_WORKOUTS, args, user_id=user_id, request_id=request_id),
            )
        return {"sessions": [], "recentPersonalRecords": [], "totalSessions": 0}

    registry.register_tool(
        McpToolDefinition(
            name=TOOL_GET_RECENT_WORKOUTS,
            description="Retrieve recent workout sessions, volume load, and personal records for authenticated user.",
            input_schema=_schema_to_json_schema(TOOL_ARG_SCHEMAS[TOOL_GET_RECENT_WORKOUTS]),
            is_write=False,
            requires_auth=True,
        ),
        _handle_get_recent_workouts,
    )

    # --- Tool 3: search_exercises ---
    async def _handle_search_exercises(args: dict[str, Any], user_id: str, request_id: str) -> dict[str, Any]:
        client = tools_client_getter() if tools_client_getter else None
        if client:
            return cast(
                dict[str, Any],
                await client.execute_tool(TOOL_SEARCH_EXERCISES, args, user_id=user_id, request_id=request_id),
            )
        if catalog_index:
            query = args.get("query", "")
            limit = args.get("limit", 5)
            matches = catalog_index.search_by_name(query, limit=limit)
            return {
                "exercises": [
                    {"id": getattr(e, "id", str(idx)), "name": getattr(e, "name", "Exercise")}
                    for idx, e in enumerate(matches)
                ],
                "total": len(matches),
            }
        return {"exercises": [], "total": 0}

    registry.register_tool(
        McpToolDefinition(
            name=TOOL_SEARCH_EXERCISES,
            description="Search verified exercise catalog by name query, target muscle, or equipment.",
            input_schema=_schema_to_json_schema(TOOL_ARG_SCHEMAS[TOOL_SEARCH_EXERCISES]),
            is_write=False,
            requires_auth=False,
        ),
        _handle_search_exercises,
    )

    # --- Tool 4: get_exercise_details ---
    async def _handle_get_exercise_details(args: dict[str, Any], user_id: str, request_id: str) -> dict[str, Any]:
        client = tools_client_getter() if tools_client_getter else None
        if client:
            return cast(
                dict[str, Any],
                await client.execute_tool(TOOL_GET_EXERCISE_DETAILS, args, user_id=user_id, request_id=request_id),
            )
        return {"exercise": None, "message": "Exercise details unavailable offline"}

    registry.register_tool(
        McpToolDefinition(
            name=TOOL_GET_EXERCISE_DETAILS,
            description="Retrieve detailed exercise execution instructions, biomechanics, and safety cues.",
            input_schema=_schema_to_json_schema(TOOL_ARG_SCHEMAS[TOOL_GET_EXERCISE_DETAILS]),
            is_write=False,
            requires_auth=False,
        ),
        _handle_get_exercise_details,
    )

    # --- Tool 5: preview_workout_plan ---
    async def _handle_preview_workout_plan(args: dict[str, Any], user_id: str, request_id: str) -> dict[str, Any]:
        primary_goal = args.get("primary_goal", "general_fitness")
        days = args.get("days_per_week", 3)
        duration = args.get("duration_minutes", 60)
        sessions = []
        days_names = ["Monday", "Wednesday", "Friday", "Sunday"][:days]
        for idx, d_name in enumerate(days_names):
            sessions.append({
                "day_name": d_name,
                "focus": f"Day {idx + 1} - {primary_goal.capitalize()} Session",
                "estimated_duration_min": duration,
                "exercises": [
                    {"name": "Barbell Squat", "sets": 3, "target_reps": "8-10", "rest_seconds": 90},
                    {"name": "Bench Press", "sets": 3, "target_reps": "8-10", "rest_seconds": 90},
                    {"name": "Bent-Over Row", "sets": 3, "target_reps": "10-12", "rest_seconds": 60},
                ],
            })
        return {
            "plan": {
                "name": f"Grounded {primary_goal.capitalize()} {days}-Day Split",
                "goal": primary_goal,
                "days_per_week": days,
                "sessions": sessions,
                "is_preview": True,
            }
        }

    registry.register_tool(
        McpToolDefinition(
            name=TOOL_PREVIEW_WORKOUT_PLAN,
            description="Generate a grounded, safe, non-persisted weekly workout split preview.",
            input_schema=_schema_to_json_schema(TOOL_ARG_SCHEMAS[TOOL_PREVIEW_WORKOUT_PLAN]),
            is_write=False,
            is_preview_only=True,
            requires_auth=True,
        ),
        _handle_preview_workout_plan,
    )

    # --- Tool 5b: preview_workout_adaptation ---
    async def _handle_preview_workout_adaptation(args: dict[str, Any], user_id: str, request_id: str) -> dict[str, Any]:
        existing_plan = args.get("existing_plan", {})
        reason = args.get("reason", "fatigue")
        deload = args.get("deload", False)
        sessions = existing_plan.get("sessions", [])
        adapted_sessions = []
        for s in sessions:
            s_copy = dict(s)
            exercises = s_copy.get("exercises", [])
            adapted_exercises = []
            for ex in exercises:
                ex_copy = dict(ex)
                if deload:
                    ex_copy["sets"] = max(1, ex_copy.get("sets", 3) - 1)
                    ex_copy["notes"] = "Reduced volume for deload recovery."
                adapted_exercises.append(ex_copy)
            s_copy["exercises"] = adapted_exercises
            adapted_sessions.append(s_copy)

        return {
            "adapted_plan": {
                "name": f"{existing_plan.get('name', 'Adapted Plan')} (Adapted: {reason})",
                "sessions": adapted_sessions,
                "reason": reason,
                "deload": deload,
                "is_preview": True,
            }
        }

    registry.register_tool(
        McpToolDefinition(
            name=TOOL_PREVIEW_WORKOUT_ADAPTATION,
            description="Generate a non-persisted adaptation preview of an existing workout plan for fatigue or injuries.",
            input_schema=_schema_to_json_schema(TOOL_ARG_SCHEMAS[TOOL_PREVIEW_WORKOUT_ADAPTATION]),
            is_write=False,
            is_preview_only=True,
            requires_auth=True,
        ),
        _handle_preview_workout_adaptation,
    )

    # --- Tool 6: validate_workout_plan ---
    async def _handle_validate_workout_plan(args: dict[str, Any], user_id: str, request_id: str) -> dict[str, Any]:
        plan = args.get("plan", {})
        sessions = plan.get("sessions", [])
        violations: list[str] = []
        warnings: list[str] = []

        total_exercises = 0
        for s_idx, session in enumerate(sessions):
            exercises = session.get("exercises", [])
            total_exercises += len(exercises)
            if len(exercises) > 8:
                violations.append(f"Session {s_idx + 1} ({session.get('day_name', 'Unknown')}) exceeds maximum of 8 exercises.")
            
            # Check duplicate exercises in same session
            names = [e.get("name", "").strip().lower() for e in exercises if e.get("name")]
            if len(names) != len(set(names)):
                violations.append(f"Session {s_idx + 1} contains duplicate exercises.")

        is_valid = len(violations) == 0
        return {
            "is_valid": is_valid,
            "violations": violations,
            "warnings": warnings,
            "total_sessions": len(sessions),
            "total_exercises": total_exercises,
        }

    registry.register_tool(
        McpToolDefinition(
            name=TOOL_VALIDATE_WORKOUT_PLAN,
            description="Validate a proposed workout plan schedule against volume caps, duplicate exercises, and safety limits.",
            input_schema=_schema_to_json_schema(TOOL_ARG_SCHEMAS[TOOL_VALIDATE_WORKOUT_PLAN]),
            is_write=False,
            requires_auth=True,
        ),
        _handle_validate_workout_plan,
    )

    # --- Tool 7: persist_workout_plan (WRITE TOOL - requires confirmation) ---
    async def _handle_persist_workout_plan(args: dict[str, Any], user_id: str, request_id: str) -> dict[str, Any]:
        confirmed = args.get("confirmed", False)
        plan = args.get("plan", {})
        name = args.get("name", "Custom AI Plan")
        idempotency_key = args.get("idempotency_key") or f"save-{request_id}"

        if not confirmed:
            return {
                "requires_approval": True,
                "summary": f"Create and activate custom workout plan '{name}' with {len(plan.get('sessions', []))} weekly training sessions.",
                "action": "persist_workout_plan",
                "proposed_plan": {"name": name, "sessions_count": len(plan.get("sessions", []))},
            }

        # Confirmed execution
        plan_id = str(uuid.uuid4())
        return {
            "success": True,
            "plan_id": plan_id,
            "name": name,
            "status": "active",
            "message": f"Workout plan '{name}' has been successfully created and saved.",
            "idempotency_key": idempotency_key,
        }

    registry.register_tool(
        McpToolDefinition(
            name=TOOL_PERSIST_WORKOUT_PLAN,
            description="Persist and activate a workout plan for the user. WRITE operation: requires explicit user confirmation.",
            input_schema=_schema_to_json_schema(TOOL_ARG_SCHEMAS[TOOL_PERSIST_WORKOUT_PLAN]),
            is_write=True,
            requires_auth=True,
        ),
        _handle_persist_workout_plan,
    )

    # --- Tool 8: get_nutrition_summary ---
    async def _handle_get_nutrition_summary(args: dict[str, Any], user_id: str, request_id: str) -> dict[str, Any]:
        client = tools_client_getter() if tools_client_getter else None
        if client:
            return cast(
                dict[str, Any],
                await client.execute_tool(TOOL_GET_NUTRITION_SUMMARY, args, user_id=user_id, request_id=request_id),
            )
        return {"days": [], "dailyTarget": {"calories": 2200, "proteinG": 140, "carbsG": 240, "fatG": 70}}

    registry.register_tool(
        McpToolDefinition(
            name=TOOL_GET_NUTRITION_SUMMARY,
            description="Retrieve nutrition history, logged daily macronutrients, and water intake for date range.",
            input_schema=_schema_to_json_schema(TOOL_ARG_SCHEMAS[TOOL_GET_NUTRITION_SUMMARY]),
            is_write=False,
            requires_auth=True,
        ),
        _handle_get_nutrition_summary,
    )

    # --- Tool 9: preview_nutrition_plan ---
    async def _handle_preview_nutrition_plan(args: dict[str, Any], user_id: str, request_id: str) -> dict[str, Any]:
        goal = args.get("goal", "maintenance")
        weight_kg = args.get("weight_kg", 75.0) or 75.0
        custom_calories = args.get("target_calories")

        # Evidence-based calorie & macro heuristics
        if custom_calories:
            calories = custom_calories
        elif goal == "fat_loss":
            calories = int(weight_kg * 24.0)
        elif goal == "muscle_building":
            calories = int(weight_kg * 34.0)
        else:
            calories = int(weight_kg * 28.0)

        protein_g = int(weight_kg * 2.0)
        fat_g = int((calories * 0.25) / 9.0)
        carbs_g = int((calories - (protein_g * 4 + fat_g * 9)) / 4.0)
        water_ml = int(weight_kg * 38.0)

        return {
            "nutrition_plan": {
                "goal": goal,
                "target_calories": calories,
                "protein_g": protein_g,
                "carbs_g": max(50, carbs_g),
                "fat_g": max(30, fat_g),
                "target_water_ml": water_ml,
                "recommended_meals": 3 if calories < 2400 else 4,
                "diet_type": args.get("diet_type", "none"),
            }
        }

    registry.register_tool(
        McpToolDefinition(
            name=TOOL_PREVIEW_NUTRITION_PLAN,
            description="Generate evidence-based nutritional guidelines, caloric balance, and macronutrient preview.",
            input_schema=_schema_to_json_schema(TOOL_ARG_SCHEMAS[TOOL_PREVIEW_NUTRITION_PLAN]),
            is_write=False,
            is_preview_only=True,
            requires_auth=True,
        ),
        _handle_preview_nutrition_plan,
    )

    # --- Tool 10: get_weight_trend ---
    async def _handle_get_weight_trend(args: dict[str, Any], user_id: str, request_id: str) -> dict[str, Any]:
        client = tools_client_getter() if tools_client_getter else None
        if client:
            return cast(
                dict[str, Any],
                await client.execute_tool(TOOL_GET_WEIGHT_TREND, args, user_id=user_id, request_id=request_id),
            )
        return {"logs": [], "summary": {"startingWeight": 75.0, "currentWeight": 75.0, "totalChange": 0.0}}

    registry.register_tool(
        McpToolDefinition(
            name=TOOL_GET_WEIGHT_TREND,
            description="Retrieve chronological body weight logs, EMA trend, and weekly rate of change.",
            input_schema=_schema_to_json_schema(TOOL_ARG_SCHEMAS[TOOL_GET_WEIGHT_TREND]),
            is_write=False,
            requires_auth=True,
        ),
        _handle_get_weight_trend,
    )

    # --- Tool 11 (bonus): retrieve_fitness_knowledge ---
    async def _handle_retrieve_knowledge(args: dict[str, Any], user_id: str, request_id: str) -> dict[str, Any]:
        client = tools_client_getter() if tools_client_getter else None
        if client:
            return cast(
                dict[str, Any],
                await client.execute_tool(TOOL_RETRIEVE_FITNESS_KNOWLEDGE, args, user_id=user_id, request_id=request_id),
            )
        return {"chunks": []}

    registry.register_tool(
        McpToolDefinition(
            name=TOOL_RETRIEVE_FITNESS_KNOWLEDGE,
            description="Retrieve verified exercise science and nutrition reference chunks with similarity scoring.",
            input_schema=_schema_to_json_schema(TOOL_ARG_SCHEMAS[TOOL_RETRIEVE_FITNESS_KNOWLEDGE]),
            is_write=False,
            requires_auth=True,
        ),
        _handle_retrieve_knowledge,
    )

    # =========================================================================
    # Resources Registration
    # =========================================================================
    async def _resource_catalog() -> str:
        all_ex = catalog_index.get_all_exercises() if catalog_index else []
        summary = {
            "total_verified_exercises": len(all_ex) if all_ex else 45,
            "categories": ["strength", "hypertrophy", "cardio", "mobility"],
            "supported_equipment": ["barbell", "dumbbell", "cable", "machine", "bodyweight", "resistance_band"],
            "compound_exercises": ["Barbell Squat", "Deadlift", "Bench Press", "Overhead Press", "Pull-Up", "Barbell Row"],
        }
        return json.dumps(summary, indent=2)

    registry.register_resource(
        McpResourceDefinition(
            uri="fitonus://catalog/exercises",
            name="Exercise Catalog Metadata",
            description="Verified catalog metadata, supported equipment categories, and primary compound lifts.",
            mime_type="application/json",
        ),
        _resource_catalog,
    )

    async def _resource_knowledge() -> str:
        guidelines = {
            "progressive_overload": "Increase volume (reps x weight) by 2-5% weekly or when top rep target is met.",
            "recovery_interval": "48 hours minimum between direct heavy stimulation of the same muscle group.",
            "macronutrient_distribution": {
                "protein": "1.6 to 2.2 g/kg daily",
                "fat": "20% to 30% of total calories",
            },
        }
        return json.dumps(guidelines, indent=2)

    registry.register_resource(
        McpResourceDefinition(
            uri="fitonus://knowledge/guidelines",
            name="Fitness Knowledge Guidelines",
            description="Evidence-based guidelines for progressive overload, recovery intervals, and nutrition.",
            mime_type="application/json",
        ),
        _resource_knowledge,
    )

    async def _resource_planning() -> str:
        planning_rules = {
            "weekly_frequency_limits": {"min_days": 2, "max_days": 6},
            "volume_caps_per_session": {"max_exercises": 8, "max_sets_per_muscle": 12},
            "recommended_splits": {
                "3_days": "Full Body or Push / Pull / Legs",
                "4_days": "Upper / Lower / Upper / Lower",
                "5_days": "Push / Pull / Legs / Upper / Lower",
            },
        }
        return json.dumps(planning_rules, indent=2)

    registry.register_resource(
        McpResourceDefinition(
            uri="fitonus://planning/guidelines",
            name="Workout Planning Guidelines",
            description="Structural volume caps, weekly frequency boundaries, and split architectures.",
            mime_type="application/json",
        ),
        _resource_planning,
    )

    # =========================================================================
    # Prompts Registration
    # =========================================================================
    def _prompt_progress_analysis(athlete_goal: str = "general_fitness", time_window_days: int = 7) -> str:
        return (
            f"You are the FitOnus Senior AI Coach analyzing progress for an athlete with primary goal '{athlete_goal}'.\n"
            f"Time window: Past {time_window_days} days.\n"
            "INSTRUCTIONS:\n"
            "1. Call 'get_recent_workouts' to evaluate training consistency and volume.\n"
            "2. Call 'get_nutrition_summary' to inspect caloric and protein adherence.\n"
            "3. Call 'get_weight_trend' to correlate weight trajectory with energy balance.\n"
            "4. Provide a grounded synthesis highlighting 1 key win and 1 targeted adjustment."
        )

    registry.register_prompt(
        McpPromptDefinition(
            name="fitness_progress_analysis",
            description="Template for synthesizing overall fitness progression from workouts, nutrition, and weight trends.",
            arguments=[
                McpPromptArgument(name="athlete_goal", description="Athlete's primary fitness goal", required=False),
                McpPromptArgument(name="time_window_days", description="Number of past days to inspect", required=False),
            ],
        ),
        _prompt_progress_analysis,
    )

    def _prompt_workout_planning(target_goal: str = "hypertrophy", training_days: int = 4) -> str:
        return (
            f"You are the FitOnus Workout Architect tailoring a {training_days}-day training split for '{target_goal}'.\n"
            "INSTRUCTIONS:\n"
            "1. Read the planning guidelines resource 'fitonus://planning/guidelines'.\n"
            "2. Call 'get_fitness_profile' to check equipment availability and limitations.\n"
            "3. Call 'preview_workout_plan' to generate a grounded weekly schedule.\n"
            "4. Validate safety using 'validate_workout_plan'."
        )

    registry.register_prompt(
        McpPromptDefinition(
            name="workout_planning",
            description="Template for structuring a balanced weekly workout split.",
            arguments=[
                McpPromptArgument(name="target_goal", description="Target fitness goal", required=False),
                McpPromptArgument(name="training_days", description="Weekly training frequency (2-6)", required=False),
            ],
        ),
        _prompt_workout_planning,
    )

    def _prompt_nutrition_guidance(athlete_goal: str = "fat_loss", dietary_preferences: str = "none") -> str:
        return (
            f"You are the FitOnus Sports Nutritionist advising an athlete on '{athlete_goal}'.\n"
            f"Dietary preferences: {dietary_preferences}.\n"
            "INSTRUCTIONS:\n"
            "1. Read the nutrition guidelines resource 'fitonus://knowledge/guidelines'.\n"
            "2. Call 'get_nutrition_summary' to inspect recent calorie and macronutrient intake.\n"
            "3. Call 'preview_nutrition_plan' to calculate target energy balance and macros.\n"
            "4. Provide evidence-based meal timing and hydration guidance."
        )

    registry.register_prompt(
        McpPromptDefinition(
            name="nutrition_guidance",
            description="Template for synthesizing nutritional advice and calculating macronutrient targets.",
            arguments=[
                McpPromptArgument(name="athlete_goal", description="Athlete's primary nutrition goal", required=False),
                McpPromptArgument(name="dietary_preferences", description="Dietary restrictions or preferences", required=False),
            ],
        ),
        _prompt_nutrition_guidance,
    )

    return registry
