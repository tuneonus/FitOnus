"""Deterministic Supervisor routing for FitOnus Multi-Agent Coach.

Evaluates:
1. User intent across English, Tamil, and Tanglish.
2. Task complexity (simple greetings / local lookups bypass multi-agent orchestration).
3. Required capabilities and minimal agent selection.
4. Available user context (e.g. existing RAG chunks or local metrics).
5. Agent availability discovered via A2A capability cards.
6. Execution cost relative to remaining request budget.
"""

import re
from typing import Final

from onusfit_ai.features.coach.application.agent.planner import (
    RE_PURE_GREETING_EN,
    RE_PURE_GREETING_TA,
    RE_PURE_GREETING_TL,
    RE_SIMPLE_LOCAL_LOOKUP_EN,
    RE_SIMPLE_LOCAL_LOOKUP_TA,
    RE_SIMPLE_LOCAL_LOOKUP_TL,
    detect_language,
)
from onusfit_ai.features.coach.domain.multi_agent import (
    AgentCapability,
    AgentRole,
    DelegatedTask,
    MultiAgentExecutionBudget,
    OrchestrationMode,
    RoutingDecision,
    SharedExecutionContext,
)

# Deterministic multilingual domain signals
_RE_WORKOUT_PLAN_CREATE: Final[re.Pattern[str]] = re.compile(
    r"(?:\b(?:create|build|make|design|generate|recommend)\b.*\b(?:workout\s+plan|routine|split|program)\b|"
    r"\b(?:balanced\s+fitness\s+routine|workout\s+plan\s+based\s+on)\b|"
    r"(?:பயிற்சி\s*திட்டம்|உடற்பயிற்சி\s*திட்டம்)|"
    r"\b(?:workout\s+plan\s+(?:pannu|kudu|venum)|pudhu\s+workout)\b)",
    re.IGNORECASE | re.UNICODE,
)

_RE_WORKOUT_ADAPT: Final[re.Pattern[str]] = re.compile(
    r"(?:\b(?:adjust|adapt|modify|change|deload|scale\s+back)\b.*\b(?:training|workout|plan|routine)\b|"
    r"\b(?:missed\s+workouts?|cut\s+workout\s+time)\b|"
    r"(?:பயிற்சியை\s*மாற்று)|"
    r"\b(?:workout\s+(?:maathu|adjust\s+pannu|kammi\s+pannu))\b)",
    re.IGNORECASE | re.UNICODE,
)

_RE_RECOVERY_SIGNAL: Final[re.Pattern[str]] = re.compile(
    r"(?:\b(?:recovery|sore|soreness|fatigued?|tired|exhausted|sleep|overtraining|rest\s+day|deload|pain|ache)\b|"
    r"(?:சோர்வு|வலி|ஓய்வு|மீட்பு)|"
    r"\b(?:romba\s+tired|valikuthu|vali|rest\s+venum|recovery\s+feedback|udambu\s+vali)\b)",
    re.IGNORECASE | re.UNICODE,
)

_RE_NUTRITION_SIGNAL: Final[re.Pattern[str]] = re.compile(
    r"(?:\b(?:nutrition|diet|calories?|macros?|protein|carbs?|meal\s+plan|eating|hydration|water)\b|"
    r"(?:உணவு|புரதம்|கலோரி)|"
    r"\b(?:saapadu|unavu|protein\s+evlo|diet\s+epdi|calorie\s+deficit)\b)",
    re.IGNORECASE | re.UNICODE,
)

_RE_PROGRESS_SIGNAL: Final[re.Pattern[str]] = re.compile(
    r"(?:\b(?:progress|consistency|weekly\s+(?:fitness\s+)?(?:progress|review)|weight\s+trend|adherence|"
    r"recent\s+progress|how\s+am\s+i\s+doing|workout\s+history)\b|"
    r"(?:முன்னேற்றம்|வாராந்திர\s*முன்னேற்றம்|எடை\s*போக்கு)|"
    r"\b(?:progress\s+(?:epdi|check|paaru)|indha\s+week\s+epdi|weight\s+trend)\b)",
    re.IGNORECASE | re.UNICODE,
)

_RE_WORKOUT_SIGNAL: Final[re.Pattern[str]] = re.compile(
    r"(?:\b(?:workout|training|exercise|squat|bench|deadlift|hypertrophy|strength|sets|reps|routine|split)\b|"
    r"(?:உடற்பயிற்சி|பயிற்சி)|"
    r"\b(?:workout|exercise|gym|thasai)\b)",
    re.IGNORECASE | re.UNICODE,
)

_RE_KNOWLEDGE_SIGNAL: Final[re.Pattern[str]] = re.compile(
    r"(?:\b(?:science|evidence|why\s+does|how\s+does|mechanism|progressive\s+overload|"
    r"form\s+cue|biomechanics|technique|guidelines?|research)\b|"
    r"(?:அறிவியல்|வழிமுறை))",
    re.IGNORECASE | re.UNICODE,
)

_RE_CONSISTENCY_WORKOUT_NUTRITION: Final[re.Pattern[str]] = re.compile(
    r"(?:(?:workout|training).*(?:nutrition|diet|protein|calorie)|"
    r"(?:nutrition|diet|protein|calorie).*(?:workout|training))",
    re.IGNORECASE | re.UNICODE,
)


def _is_simple_bypass_query(msg: str) -> bool:
    trimmed = msg.strip()
    if (
        RE_PURE_GREETING_EN.match(trimmed)
        or RE_PURE_GREETING_TA.match(trimmed)
        or RE_PURE_GREETING_TL.match(trimmed)
    ):
        return True
    if (
        RE_SIMPLE_LOCAL_LOOKUP_EN.match(trimmed)
        or RE_SIMPLE_LOCAL_LOOKUP_TA.match(trimmed)
        or RE_SIMPLE_LOCAL_LOOKUP_TL.match(trimmed)
    ):
        return True
    if re.match(
        r"^(?:how\s+many\s+calories\s+(?:did\s+i\s+(?:log|eat|have)\s+)?today|"
        r"what\s+(?:are\s+my\s+calories|is\s+my\s+water)\s+today)[!?.\s]*$",
        trimmed,
        re.IGNORECASE,
    ):
        return True
    return False


class SupervisorRouter:
    """Deterministic supervisor router mapping user intent + context to agent DAGs."""

    def route(
        self,
        shared_ctx: SharedExecutionContext,
        *,
        available_agents: set[AgentRole] | None = None,
        budget: MultiAgentExecutionBudget | None = None,
    ) -> RoutingDecision:
        """Select orchestration mode, agents, and task dependencies deterministically."""
        msg = shared_ctx.user_message.strip()
        lang = detect_language(msg)
        avail = available_agents or {
            AgentRole.WORKOUT,
            AgentRole.NUTRITION,
            AgentRole.PROGRESS,
            AgentRole.RECOVERY,
            AgentRole.KNOWLEDGE,
        }
        eff_budget = budget or MultiAgentExecutionBudget()
        has_attachments = shared_ctx.has_image_attachment or shared_ctx.has_audio_attachment
        attachment_input: dict[str, object] = (
            {
                "has_multimodal_attachment": True,
                "modalities": list(shared_ctx.attachment_modalities),
            }
            if has_attachments
            else {}
        )

        # 1. Bypass simple greetings and local today-metric queries (0 agents, 0 tools)
        if not has_attachments and _is_simple_bypass_query(msg):
            return RoutingDecision(
                mode=OrchestrationMode.BYPASS,
                goal_type="simple_bypass",
                language=lang,
                selected_agents=[],
                tasks=[],
                bypass_reason=(
                    "Simple greeting or local context lookup requires no specialist delegation."
                ),
                rationale="Direct single-turn synthesis avoids unnecessary agent overhead.",
                estimated_tool_calls=0,
                estimated_llm_calls=1,
            )

        has_plan_create = bool(_RE_WORKOUT_PLAN_CREATE.search(msg))
        has_plan_adapt = bool(_RE_WORKOUT_ADAPT.search(msg))
        has_recovery = bool(_RE_RECOVERY_SIGNAL.search(msg))
        has_nutrition = bool(_RE_NUTRITION_SIGNAL.search(msg)) or has_attachments
        has_progress = bool(_RE_PROGRESS_SIGNAL.search(msg))
        has_workout = bool(_RE_WORKOUT_SIGNAL.search(msg)) or has_plan_create or has_plan_adapt
        has_knowledge = bool(_RE_KNOWLEDGE_SIGNAL.search(msg))
        has_workout_and_nutrition = bool(_RE_CONSISTENCY_WORKOUT_NUTRITION.search(msg))

        tasks: list[DelegatedTask] = []

        # 2. Sequential: Adjust training based on recovery feedback (Recovery -> Workout)
        if (has_plan_adapt or has_workout) and has_recovery and not has_nutrition:
            if AgentRole.RECOVERY in avail:
                tasks.append(
                    DelegatedTask(
                        task_id="task_recovery_eval",
                        target_agent=AgentRole.RECOVERY,
                        task_type="evaluate_recovery_state",
                        instructions="Assess user-reported fatigue/soreness and recovery load.",
                        required_capabilities=[AgentCapability.RECOVERY_GUIDANCE],
                        priority=1,
                    )
                )
            if AgentRole.WORKOUT in avail:
                deps = ["task_recovery_eval"] if tasks else []
                tasks.append(
                    DelegatedTask(
                        task_id="task_workout_adapt",
                        target_agent=AgentRole.WORKOUT,
                        task_type="adapt_workout_plan",
                        instructions=(
                            "Adapt workout plan intensity/volume based on recovery guidance."
                        ),
                        required_capabilities=[AgentCapability.WORKOUT_ADAPTATION],
                        depends_on=deps,
                        dependency_type="optional",
                        priority=2,
                    )
                )
            mode = (
                OrchestrationMode.SEQUENTIAL
                if len(tasks) > 1
                else OrchestrationMode.SINGLE_AGENT
            )
            return self._finalize_decision(
                mode=mode,
                goal_type="recovery_workout_adjustment",
                lang=lang,
                tasks=tasks,
                budget=eff_budget,
                rationale="Recovery assessment feeds directly into safe workout adaptation.",
            )

        # 3. Sequential / Hybrid: Create workout plan based on progress (+ balanced routine)
        has_routine_kw = "balanced" in msg.lower() or "routine" in msg.lower()
        if has_plan_create and (has_progress or has_routine_kw):
            if AgentRole.PROGRESS in avail and has_progress:
                tasks.append(
                    DelegatedTask(
                        task_id="task_progress_review",
                        target_agent=AgentRole.PROGRESS,
                        task_type="analyze_recent_progress",
                        instructions=(
                            "Summarize recent training volume, adherence, and weight trends."
                        ),
                        required_capabilities=[AgentCapability.PROGRESS_TRACKING],
                        priority=1,
                    )
                )
            if AgentRole.WORKOUT in avail:
                has_prog_task = any(t.task_id == "task_progress_review" for t in tasks)
                deps = ["task_progress_review"] if has_prog_task else []
                tasks.append(
                    DelegatedTask(
                        task_id="task_workout_plan",
                        target_agent=AgentRole.WORKOUT,
                        task_type="generate_workout_plan",
                        instructions=(
                            "Build a safe, grounded workout routine tailored to user progress."
                        ),
                        required_capabilities=[AgentCapability.WORKOUT_PLANNING],
                        depends_on=deps,
                        dependency_type="optional",
                        priority=2,
                    )
                )
            if (has_nutrition or "balanced" in msg.lower()) and AgentRole.NUTRITION in avail:
                tasks.append(
                    DelegatedTask(
                        task_id="task_nutrition_guidance",
                        target_agent=AgentRole.NUTRITION,
                        task_type="analyze_and_preview_nutrition",
                        instructions=(
                            "Provide grounded calorie and macronutrient targets "
                            "supporting the routine."
                        ),
                        required_capabilities=[AgentCapability.NUTRITION_ANALYSIS],
                        priority=2,
                    )
                )
            if (has_recovery or "balanced" in msg.lower()) and AgentRole.RECOVERY in avail:
                tasks.append(
                    DelegatedTask(
                        task_id="task_recovery_guidance",
                        target_agent=AgentRole.RECOVERY,
                        task_type="evaluate_recovery_state",
                        instructions="Recommend rest day cadence and recovery pacing.",
                        required_capabilities=[AgentCapability.RECOVERY_GUIDANCE],
                        priority=2,
                    )
                )

            if len(tasks) == 1:
                mode = OrchestrationMode.SINGLE_AGENT
            elif any(t.depends_on for t in tasks) and any(not t.depends_on for t in tasks[1:]):
                mode = OrchestrationMode.HYBRID
            elif any(t.depends_on for t in tasks):
                mode = OrchestrationMode.SEQUENTIAL
            else:
                mode = OrchestrationMode.PARALLEL
            return self._finalize_decision(
                mode=mode,
                goal_type="progress_based_workout_or_routine",
                lang=lang,
                tasks=tasks,
                budget=eff_budget,
                rationale=(
                    "Coordinate progress/recovery context with workout and nutrition planning."
                ),
            )

        # 4. Parallel: Workout and nutrition consistency analysis
        if has_workout_and_nutrition or (has_workout and has_nutrition):
            if AgentRole.WORKOUT in avail:
                tasks.append(
                    DelegatedTask(
                        task_id="task_workout_consistency",
                        target_agent=AgentRole.WORKOUT,
                        task_type="analyze_workouts",
                        instructions="Review recent workout sessions, consistency, and volume.",
                        required_capabilities=[AgentCapability.WORKOUT_HISTORY],
                        priority=1,
                    )
                )
            if AgentRole.NUTRITION in avail:
                tasks.append(
                    DelegatedTask(
                        task_id="task_nutrition_consistency",
                        target_agent=AgentRole.NUTRITION,
                        task_type="analyze_nutrition",
                        instructions="Analyze calorie, protein, and hydration adherence.",
                        input_data=dict(attachment_input),
                        required_capabilities=(
                            [
                                AgentCapability.NUTRITION_ANALYSIS,
                                AgentCapability.MULTIMODAL_ANALYSIS,
                            ]
                            if has_attachments
                            else [AgentCapability.NUTRITION_ANALYSIS]
                        ),
                        priority=1,
                    )
                )
            if has_progress and AgentRole.PROGRESS in avail:
                tasks.append(
                    DelegatedTask(
                        task_id="task_progress_trend",
                        target_agent=AgentRole.PROGRESS,
                        task_type="analyze_recent_progress",
                        instructions="Analyze weight and goal trend alongside training and diet.",
                        required_capabilities=[AgentCapability.PROGRESS_TRACKING],
                        priority=2,
                    )
                )
            mode = (
                OrchestrationMode.PARALLEL
                if len(tasks) > 1
                else OrchestrationMode.SINGLE_AGENT
            )
            return self._finalize_decision(
                mode=mode,
                goal_type="workout_nutrition_consistency",
                lang=lang,
                tasks=tasks,
                budget=eff_budget,
                rationale="Workout and nutrition domains are independent and run in parallel.",
            )

        # 5. Weekly fitness progress review (Progress + optional Recovery/Nutrition)
        if has_progress:
            if AgentRole.PROGRESS in avail:
                tasks.append(
                    DelegatedTask(
                        task_id="task_weekly_progress",
                        target_agent=AgentRole.PROGRESS,
                        task_type="analyze_recent_progress",
                        instructions=(
                            "Analyze weekly workouts, nutrition adherence, and weight trend."
                        ),
                        required_capabilities=[AgentCapability.PROGRESS_TRACKING],
                        priority=1,
                    )
                )
            if has_recovery and AgentRole.RECOVERY in avail:
                tasks.append(
                    DelegatedTask(
                        task_id="task_recovery_check",
                        target_agent=AgentRole.RECOVERY,
                        task_type="evaluate_recovery_state",
                        instructions="Evaluate recovery load alongside weekly progress.",
                        required_capabilities=[AgentCapability.RECOVERY_GUIDANCE],
                        priority=2,
                    )
                )
            mode = (
                OrchestrationMode.PARALLEL
                if len(tasks) > 1
                else OrchestrationMode.SINGLE_AGENT
            )
            return self._finalize_decision(
                mode=mode,
                goal_type="weekly_fitness_progress",
                lang=lang,
                tasks=tasks,
                budget=eff_budget,
                rationale="Aggregate multi-domain progress metrics efficiently.",
            )

        # 6. Single-Agent Specialized Routes (minimum cost)
        if has_plan_create and AgentRole.WORKOUT in avail:
            tasks.append(
                DelegatedTask(
                    task_id="task_workout_plan",
                    target_agent=AgentRole.WORKOUT,
                    task_type="generate_workout_plan",
                    instructions="Generate grounded workout plan preview.",
                    required_capabilities=[AgentCapability.WORKOUT_PLANNING],
                    priority=1,
                )
            )
            return self._finalize_decision(
                mode=OrchestrationMode.SINGLE_AGENT,
                goal_type="workout_planning",
                lang=lang,
                tasks=tasks,
                budget=eff_budget,
                rationale="Single workout planning specialist suffices.",
            )

        if has_nutrition and AgentRole.NUTRITION in avail:
            tasks.append(
                DelegatedTask(
                    task_id="task_nutrition_only",
                    target_agent=AgentRole.NUTRITION,
                    task_type="analyze_nutrition",
                    instructions=(
                        "Analyze attached meal photo/audio and nutrition macro alignment."
                        if has_attachments
                        else "Analyze nutrition summary and macro alignment."
                    ),
                    input_data=dict(attachment_input),
                    required_capabilities=(
                        [AgentCapability.NUTRITION_ANALYSIS, AgentCapability.MULTIMODAL_ANALYSIS]
                        if has_attachments
                        else [AgentCapability.NUTRITION_ANALYSIS]
                    ),
                    priority=1,
                )
            )
            return self._finalize_decision(
                mode=OrchestrationMode.SINGLE_AGENT,
                goal_type="nutrition_analysis",
                lang=lang,
                tasks=tasks,
                budget=eff_budget,
                rationale="Single nutrition specialist handles dietary inquiry.",
            )

        if has_recovery and AgentRole.RECOVERY in avail:
            tasks.append(
                DelegatedTask(
                    task_id="task_recovery_only",
                    target_agent=AgentRole.RECOVERY,
                    task_type="evaluate_recovery_state",
                    instructions="Provide recovery guidance using user-reported context.",
                    required_capabilities=[AgentCapability.RECOVERY_GUIDANCE],
                    priority=1,
                )
            )
            return self._finalize_decision(
                mode=OrchestrationMode.SINGLE_AGENT,
                goal_type="recovery_guidance",
                lang=lang,
                tasks=tasks,
                budget=eff_budget,
                rationale="Single recovery specialist handles recovery inquiry.",
            )

        if has_knowledge and AgentRole.KNOWLEDGE in avail:
            # Reuse existing RAG context if already populated, avoiding unnecessary tool calls
            tasks.append(
                DelegatedTask(
                    task_id="task_knowledge_rag",
                    target_agent=AgentRole.KNOWLEDGE,
                    task_type="retrieve_knowledge",
                    instructions="Ground answer in verified RAG knowledge chunks.",
                    required_capabilities=[AgentCapability.KNOWLEDGE_RETRIEVAL],
                    priority=1,
                )
            )
            return self._finalize_decision(
                mode=OrchestrationMode.SINGLE_AGENT,
                goal_type="knowledge_retrieval",
                lang=lang,
                tasks=tasks,
                budget=eff_budget,
                rationale="Knowledge agent grounds technical fitness explanations.",
            )

        if has_workout and AgentRole.WORKOUT in avail:
            tasks.append(
                DelegatedTask(
                    task_id="task_workout_only",
                    target_agent=AgentRole.WORKOUT,
                    task_type="analyze_workouts",
                    instructions="Analyze workouts or search catalog exercises.",
                    required_capabilities=[AgentCapability.WORKOUT_HISTORY],
                    priority=1,
                )
            )
            return self._finalize_decision(
                mode=OrchestrationMode.SINGLE_AGENT,
                goal_type="workout_analysis",
                lang=lang,
                tasks=tasks,
                budget=eff_budget,
                rationale="Single workout specialist handles exercise/workout query.",
            )

        # 7. Default fallback: general coaching conversation bypasses heavy orchestration
        return RoutingDecision(
            mode=OrchestrationMode.BYPASS,
            goal_type="general_coaching_qa",
            language=lang,
            selected_agents=[],
            tasks=[],
            bypass_reason="General inquiry requires no multi-agent delegation.",
            rationale="Direct Coach synthesis minimizes latency and token spend.",
            estimated_tool_calls=0,
            estimated_llm_calls=1,
        )

    def _finalize_decision(
        self,
        *,
        mode: OrchestrationMode,
        goal_type: str,
        lang: str,
        tasks: list[DelegatedTask],
        budget: MultiAgentExecutionBudget,
        rationale: str,
    ) -> RoutingDecision:
        if not tasks:
            return RoutingDecision(
                mode=OrchestrationMode.BYPASS,
                goal_type=goal_type,
                language=lang,  # type: ignore[arg-type]
                selected_agents=[],
                tasks=[],
                bypass_reason="No eligible specialist agent available within constraints.",
                rationale=rationale,
                estimated_tool_calls=0,
                estimated_llm_calls=1,
            )

        # Cost-aware capping: trim lower-priority tasks if exceeding max_agent_invocations
        sorted_tasks = sorted(tasks, key=lambda t: t.priority)
        capped = sorted_tasks[: budget.max_agent_invocations]
        selected_roles: list[AgentRole] = []
        for t in capped:
            if t.target_agent not in selected_roles:
                selected_roles.append(t.target_agent)

        eff_mode = mode
        if len(capped) == 1 and mode != OrchestrationMode.BYPASS:
            eff_mode = OrchestrationMode.SINGLE_AGENT

        return RoutingDecision(
            mode=eff_mode,
            goal_type=goal_type,
            language=lang,  # type: ignore[arg-type]
            selected_agents=selected_roles,
            tasks=capped,
            rationale=rationale,
            estimated_tool_calls=min(len(capped) * 2, budget.max_tool_calls),
            estimated_llm_calls=1,
        )
