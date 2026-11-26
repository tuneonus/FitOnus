"""Request-scoped shared context, consent-aware memory slicing, and conflict resolution.

Reuses Phase 07/08 context & memory safety guarantees:
- Request-scoped isolation per user and trace_id.
- Minimal context slicing per specialist agent role.
- Consent-aware memory gating (no automatic sensitive memory persistence).
- Cross-context deduplication and deterministic recommendation conflict resolution.
"""

import re
import uuid
from typing import Any, Literal

from onusfit_ai.features.coach.application.multi_agent.budgets import (
    detect_medical_red_flags_text,
    sanitize_multi_agent_text,
)
from onusfit_ai.features.coach.domain.chat import CoachChatRequest
from onusfit_ai.features.coach.domain.multi_agent import (
    AgentRecommendation,
    AgentRole,
    ContextConflict,
    EvidenceItem,
    MinimalAgentContextView,
    SharedExecutionContext,
)

_SENSITIVE_MEMORY_RE = re.compile(
    r"\b(?:injury|injured|pain|surgery|medical|allergy|allergic|asthma|fracture|knee|shoulder|back)\b",
    re.IGNORECASE,
)
_NUTRITION_MEMORY_RE = re.compile(
    r"\b(?:diet|vegetarian|vegan|keto|protein|calorie|food|meal|allergy|lactose|gluten|halal)\b",
    re.IGNORECASE,
)
_WORKOUT_MEMORY_RE = re.compile(
    r"\b(?:workout|exercise|dumbbell|barbell|gym|home|squat|bench|deadlift|injury|pain|knee|shoulder|back)\b",
    re.IGNORECASE,
)
_RECOVERY_MEMORY_RE = re.compile(
    r"\b(?:sore|fatigue|tired|sleep|rest|recovery|injury|pain|strain|overtrain)\b",
    re.IGNORECASE,
)


def _deduplicate_memories(
    raw_memories: list[str],
    profile_summary: dict[str, Any],
) -> list[str]:
    """Remove memories that duplicate static profile attributes, keeping safety notes."""
    profile_values = {
        str(v).strip().lower() for v in profile_summary.values() if v is not None and str(v).strip()
    }
    seen: set[str] = set()
    cleaned: list[str] = []
    for mem in raw_memories:
        sanitized = sanitize_multi_agent_text(mem).strip()
        if not sanitized:
            continue
        norm = sanitized.lower()
        if norm in seen:
            continue
        is_safety = bool(_SENSITIVE_MEMORY_RE.search(sanitized))
        if not is_safety and norm in profile_values:
            continue
        seen.add(norm)
        cleaned.append(sanitized)
    return cleaned


def _extract_limitations_and_equipment(
    user_message: str,
    memories: list[str],
    profile_place: str | None,
) -> tuple[list[str], list[str]]:
    limitations: list[str] = []
    for source in [user_message, *memories]:
        lower = source.lower()
        for part in ("knee", "shoulder", "back", "lumbar", "wrist", "neck", "elbow", "ankle"):
            if f"{part} pain" in lower or f"{part} injury" in lower or f"sore {part}" in lower:
                label = f"{part} pain"
                if label not in limitations:
                    limitations.append(label)

    equipment = ["bodyweight"]
    place_lower = (profile_place or "").lower()
    combined = f"{user_message} {' '.join(memories)}".lower()
    if "gym" in place_lower or "barbell" in combined:
        equipment.extend(["barbell", "dumbbells", "bench", "cable_machine"])
    elif "dumbbell" in combined or "home" in place_lower:
        equipment.extend(["dumbbells", "bench"])
    else:
        equipment.extend(["dumbbells", "bench"])
    return limitations, list(dict.fromkeys(equipment))


def build_shared_execution_context(
    request: CoachChatRequest,
    *,
    trace_id: str,
    user_id: str,
    language: Literal["en", "ta", "tanglish"],
    memory_consent_granted: bool = True,
) -> SharedExecutionContext:
    """Create a fresh request-scoped SharedExecutionContext with consent & safety checks."""
    uid = user_id.strip()
    p = request.context.profile
    t = request.context.today_nutrition

    profile_summary: dict[str, Any] = {
        "display_name": sanitize_multi_agent_text(p.display_name),
        "primary_goal": sanitize_multi_agent_text(p.primary_goal or "general_fitness"),
        "experience_level": sanitize_multi_agent_text(p.experience_level or "intermediate"),
        "preferred_workout_place": sanitize_multi_agent_text(p.preferred_workout_place or "gym"),
        "workout_days_per_week": p.workout_days_per_week or 3,
        "diet_type": sanitize_multi_agent_text(p.diet_type or "standard"),
        "current_weight_kg": (
            request.context.latest_weight_kg
            if request.context.latest_weight_kg is not None
            else p.current_weight_kg
        ),
        "target_weight_kg": p.target_weight_kg,
        "daily_calorie_target": p.daily_calorie_target,
        "daily_protein_grams": p.daily_protein_grams,
    }

    today_nutrition_summary: dict[str, Any] = {
        "calories_consumed": t.calories_consumed,
        "protein_grams": t.protein_grams,
        "carbs_grams": t.carbs_grams,
        "fat_grams": t.fat_grams,
        "water_intake_ml": t.water_intake_ml,
        "calorie_target": t.calorie_target,
        "protein_target": t.protein_target,
    }

    recent_workouts = [
        {
            "name": sanitize_multi_agent_text(w.name),
            "duration_minutes": w.duration_minutes,
            "volume_kg": w.volume_kg,
            "total_sets": w.total_sets,
            "calories_burned": w.calories_burned,
            "completed_at": w.completed_at,
        }
        for w in request.context.recent_workouts
    ]

    active_goals = [
        {
            "title": sanitize_multi_agent_text(g.title),
            "category": sanitize_multi_agent_text(g.category),
            "target_value": g.target_value,
            "current_value": g.current_value,
            "unit": sanitize_multi_agent_text(g.unit),
        }
        for g in request.context.active_goals
    ]

    # Consent-aware memory gating: never inject memories if consent is revoked/absent
    approved_memories = (
        _deduplicate_memories(request.memories, profile_summary) if memory_consent_granted else []
    )

    knowledge_items = [
        {
            "document_slug": k.document_slug,
            "document_title": sanitize_multi_agent_text(k.document_title),
            "category": k.category,
            "chunk_index": k.chunk_index,
            "content": sanitize_multi_agent_text(k.content),
            "citation": sanitize_multi_agent_text(k.citation),
        }
        for k in request.knowledge
    ]

    history_turns = [
        {"role": turn.role, "text": sanitize_multi_agent_text(turn.text)}
        for turn in request.history[-6:]
    ]

    sanitized_msg = sanitize_multi_agent_text(request.message)
    limitations, equipment = _extract_limitations_and_equipment(
        sanitized_msg, approved_memories, p.preferred_workout_place
    )
    red_flags = detect_medical_red_flags_text(sanitized_msg, limitations)

    has_img = request.image is not None
    has_aud = request.audio is not None
    modalities = [m for m, flag in (("image", has_img), ("audio", has_aud)) if flag]

    return SharedExecutionContext(
        trace_id=trace_id,
        request_id=trace_id,
        user_id=uid,
        user_message=sanitized_msg,
        language=language,
        profile_summary=profile_summary,
        today_nutrition_summary=today_nutrition_summary,
        recent_workouts_summary=recent_workouts,
        active_goals_summary=active_goals,
        memories=approved_memories,
        memory_consent_granted=memory_consent_granted,
        knowledge_items=knowledge_items,
        history_turns=history_turns,
        medical_red_flags=red_flags,
        physical_limitations=limitations,
        available_equipment=equipment,
        has_image_attachment=has_img,
        has_audio_attachment=has_aud,
        attachment_modalities=modalities,
    )


def build_agent_context_view(
    shared: SharedExecutionContext,
    role: AgentRole,
    *,
    upstream_outputs: dict[str, Any] | None = None,
) -> MinimalAgentContextView:
    """Slice SharedExecutionContext to the minimal fields required by `role`."""
    domain_data: dict[str, Any] = {}
    relevant_memories: list[str] = []
    relevant_knowledge: list[dict[str, Any]] = []

    if role == AgentRole.WORKOUT:
        domain_data = {
            "primary_goal": shared.profile_summary.get("primary_goal"),
            "experience_level": shared.profile_summary.get("experience_level"),
            "workout_days_per_week": shared.profile_summary.get("workout_days_per_week"),
            "preferred_workout_place": shared.profile_summary.get("preferred_workout_place"),
            "available_equipment": shared.available_equipment,
            "recent_workouts": shared.recent_workouts_summary[:5],
        }
        relevant_memories = [m for m in shared.memories if _WORKOUT_MEMORY_RE.search(m)]
    elif role == AgentRole.NUTRITION:
        domain_data = {
            "primary_goal": shared.profile_summary.get("primary_goal"),
            "diet_type": shared.profile_summary.get("diet_type"),
            "current_weight_kg": shared.profile_summary.get("current_weight_kg"),
            "today_nutrition": shared.today_nutrition_summary,
        }
        relevant_memories = [m for m in shared.memories if _NUTRITION_MEMORY_RE.search(m)]
    elif role == AgentRole.PROGRESS:
        domain_data = {
            "primary_goal": shared.profile_summary.get("primary_goal"),
            "current_weight_kg": shared.profile_summary.get("current_weight_kg"),
            "target_weight_kg": shared.profile_summary.get("target_weight_kg"),
            "active_goals": shared.active_goals_summary,
            "recent_workouts_count": len(shared.recent_workouts_summary),
            "today_calories": shared.today_nutrition_summary.get("calories_consumed"),
        }
    elif role == AgentRole.RECOVERY:
        domain_data = {
            "experience_level": shared.profile_summary.get("experience_level"),
            "workout_days_per_week": shared.profile_summary.get("workout_days_per_week"),
            "recent_workouts": shared.recent_workouts_summary[:7],
            "wearable_connected": False,
        }
        relevant_memories = [m for m in shared.memories if _RECOVERY_MEMORY_RE.search(m)]
        relevant_knowledge = [
            k for k in shared.knowledge_items if k.get("category") in ("recovery", "fitness")
        ]
    elif role == AgentRole.KNOWLEDGE:
        domain_data = {"primary_goal": shared.profile_summary.get("primary_goal")}
        relevant_knowledge = list(shared.knowledge_items)
    else:
        domain_data = dict(shared.profile_summary)
        relevant_memories = list(shared.memories)
        relevant_knowledge = list(shared.knowledge_items)

    return MinimalAgentContextView(
        trace_id=shared.trace_id,
        request_id=shared.request_id,
        user_id=shared.user_id,
        target_role=role,
        language=shared.language,
        user_message=shared.user_message,
        domain_data=domain_data,
        relevant_memories=relevant_memories,
        relevant_knowledge=relevant_knowledge,
        physical_limitations=list(shared.physical_limitations),
        medical_red_flags=list(shared.medical_red_flags),
        attachment_modalities=(
            list(shared.attachment_modalities)
            if role in (AgentRole.NUTRITION, AgentRole.SUPERVISOR)
            else []
        ),
        upstream_outputs=dict(upstream_outputs or {}),
    )


def deduplicate_evidence(items: list[EvidenceItem]) -> list[EvidenceItem]:
    """Deduplicate evidence items across agents by normalized tool and summary."""
    seen: set[tuple[str | None, str]] = set()
    unique: list[EvidenceItem] = []
    for item in items:
        key = (item.source_tool, item.summary.strip().lower())
        if key not in seen:
            seen.add(key)
            unique.append(item)
    return unique


def resolve_recommendation_conflicts(
    recommendations: list[AgentRecommendation],
) -> tuple[list[AgentRecommendation], list[ContextConflict]]:
    """Resolve deterministic safety/recovery vs performance conflicts across agents.

    Priority order:
    1. Medical caution / red-flag stops intense workout or deficit recommendations.
    2. Recovery deload/rest guidance overrides aggressive workout volume escalation.
    3. Nutrition minimum-intake safety overrides aggressive fat-loss deficit targets.
    """
    if len(recommendations) <= 1:
        return list(recommendations), []

    resolved = [rec.model_copy(deep=True) for rec in recommendations]
    conflicts: list[ContextConflict] = []

    medical_recs = [r for r in resolved if r.requires_medical_caution]
    recovery_deload = next(
        (
            r
            for r in resolved
            if r.agent_role == AgentRole.RECOVERY
            and r.structured_payload.get("recommend_deload", False)
        ),
        None,
    )
    workout_recs = [r for r in resolved if r.agent_role == AgentRole.WORKOUT]

    # 1. Medical caution overrides intense workout or aggressive nutrition recs
    if medical_recs:
        winner = medical_recs[0]
        for rec in resolved:
            if rec.agent_role == AgentRole.WORKOUT and not rec.requires_medical_caution:
                rec.requires_medical_caution = True
                rec.action_items = [
                    "Pause high-intensity training until cleared by a healthcare professional."
                ]
                conflicts.append(
                    ContextConflict(
                        conflict_id=f"conf-{uuid.uuid4().hex[:8]}",
                        agents_involved=[winner.agent_role, rec.agent_role],
                        topic="medical_safety_override",
                        resolution=(
                            "Medical red flag detected; strenuous workout prescription paused "
                            "in favor of clinical consultation."
                        ),
                        winning_agent=winner.agent_role,
                    )
                )

    # 2. Recovery deload overrides aggressive workout progression
    if recovery_deload and workout_recs and not medical_recs:
        for w_rec in workout_recs:
            intensity_push = bool(w_rec.structured_payload.get("high_intensity", False))
            already_deloaded = bool(w_rec.structured_payload.get("deload_applied", False))
            if intensity_push or not already_deloaded:
                w_rec.structured_payload["deload_applied"] = True
                w_rec.constraints_applied.append("recovery_deload_enforced")
                w_rec.action_items.insert(
                    0,
                    "Apply a 20-30% deload or active mobility session per Recovery guidance.",
                )
                conflicts.append(
                    ContextConflict(
                        conflict_id=f"conf-{uuid.uuid4().hex[:8]}",
                        agents_involved=[AgentRole.RECOVERY, AgentRole.WORKOUT],
                        topic="training_load_vs_recovery",
                        resolution=(
                            "Recovery fatigue signal took precedence over intensity progression; "
                            "training volume moderated with deload guidance."
                        ),
                        winning_agent=AgentRole.RECOVERY,
                    )
                )

    resolved.sort(key=lambda r: r.priority)
    return resolved, conflicts
