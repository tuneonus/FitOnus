"""Scoped MCP tool gateway for specialized agents with caching and cumulative quota.

Reuses Phase 12 tool schemas (`shared.contracts.tools`), sanitization, and MCP/native
execution bridges while enforcing:
- Agent-specific tool allowlists and capability checks.
- Request-scoped shared tool cache + duplicate call prevention.
- Centralized cumulative quota accounting via `CumulativeBudgetTracker`.
- Mutation tools disabled by default unless durable Node.js approval & idempotency exist.
"""

import asyncio
import copy
import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any, Final

from pydantic import ValidationError

from onusfit_ai.features.coach.application.multi_agent.budgets import (
    CumulativeBudgetTracker,
    MultiAgentBudgetExceededError,
    sanitize_multi_agent_text,
)
from onusfit_ai.features.coach.domain.multi_agent import AgentCapability, AgentRole
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
from onusfit_ai.shared.llm.ports import sanitize_tool_error

logger = logging.getLogger("onusfit_ai.coach.multi_agent.mcp_gateway")

ToolCallback = Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]]

TRUSTED_READ_ONLY_TOOLS: Final[frozenset[str]] = frozenset(
    {
        TOOL_GET_FITNESS_PROFILE,
        TOOL_GET_RECENT_WORKOUTS,
        TOOL_GET_NUTRITION_SUMMARY,
        TOOL_GET_WEIGHT_TREND,
        TOOL_SEARCH_EXERCISES,
        TOOL_GET_EXERCISE_DETAILS,
        TOOL_RETRIEVE_FITNESS_KNOWLEDGE,
        TOOL_PREVIEW_WORKOUT_PLAN,
        TOOL_PREVIEW_WORKOUT_ADAPTATION,
        TOOL_VALIDATE_WORKOUT_PLAN,
        TOOL_PREVIEW_NUTRITION_PLAN,
    }
)

MUTATION_TOOLS: Final[frozenset[str]] = frozenset({TOOL_PERSIST_WORKOUT_PLAN})

AGENT_TOOL_ALLOWLISTS: Final[dict[AgentRole, frozenset[str]]] = {
    AgentRole.SUPERVISOR: frozenset(),
    AgentRole.WORKOUT: frozenset(
        {
            TOOL_GET_FITNESS_PROFILE,
            TOOL_GET_RECENT_WORKOUTS,
            TOOL_SEARCH_EXERCISES,
            TOOL_GET_EXERCISE_DETAILS,
            TOOL_PREVIEW_WORKOUT_PLAN,
            TOOL_PREVIEW_WORKOUT_ADAPTATION,
            TOOL_VALIDATE_WORKOUT_PLAN,
        }
    ),
    AgentRole.NUTRITION: frozenset(
        {
            TOOL_GET_FITNESS_PROFILE,
            TOOL_GET_NUTRITION_SUMMARY,
            TOOL_PREVIEW_NUTRITION_PLAN,
        }
    ),
    AgentRole.PROGRESS: frozenset(
        {
            TOOL_GET_FITNESS_PROFILE,
            TOOL_GET_RECENT_WORKOUTS,
            TOOL_GET_NUTRITION_SUMMARY,
            TOOL_GET_WEIGHT_TREND,
        }
    ),
    AgentRole.RECOVERY: frozenset(
        {
            TOOL_GET_FITNESS_PROFILE,
            TOOL_GET_RECENT_WORKOUTS,
            TOOL_RETRIEVE_FITNESS_KNOWLEDGE,
        }
    ),
    AgentRole.KNOWLEDGE: frozenset(
        {
            TOOL_RETRIEVE_FITNESS_KNOWLEDGE,
            TOOL_GET_EXERCISE_DETAILS,
        }
    ),
}

TOOL_REQUIRED_CAPABILITY: Final[dict[str, AgentCapability]] = {
    TOOL_GET_FITNESS_PROFILE: AgentCapability.INTENT_ROUTING,  # overridden below per role check
    TOOL_GET_RECENT_WORKOUTS: AgentCapability.WORKOUT_HISTORY,
    TOOL_SEARCH_EXERCISES: AgentCapability.EXERCISE_CATALOG,
    TOOL_GET_EXERCISE_DETAILS: AgentCapability.EXERCISE_CATALOG,
    TOOL_PREVIEW_WORKOUT_PLAN: AgentCapability.WORKOUT_PLANNING,
    TOOL_PREVIEW_WORKOUT_ADAPTATION: AgentCapability.WORKOUT_ADAPTATION,
    TOOL_VALIDATE_WORKOUT_PLAN: AgentCapability.WORKOUT_VALIDATION,
    TOOL_GET_NUTRITION_SUMMARY: AgentCapability.NUTRITION_ANALYSIS,
    TOOL_PREVIEW_NUTRITION_PLAN: AgentCapability.NUTRITION_PLANNING,
    TOOL_GET_WEIGHT_TREND: AgentCapability.WEIGHT_ANALYSIS,
    TOOL_RETRIEVE_FITNESS_KNOWLEDGE: AgentCapability.KNOWLEDGE_RETRIEVAL,
}

# Read profile capability accepted across all specialist roles
_PROFILE_CAPABILITIES: Final[frozenset[AgentCapability]] = frozenset(
    {
        AgentCapability.WORKOUT_PLANNING,
        AgentCapability.WORKOUT_HISTORY,
        AgentCapability.NUTRITION_ANALYSIS,
        AgentCapability.PROGRESS_TRACKING,
        AgentCapability.RECOVERY_GUIDANCE,
    }
)
# Read workouts also accepted for Progress/Recovery agents
_WORKOUTS_CAPABILITIES: Final[frozenset[AgentCapability]] = frozenset(
    {
        AgentCapability.WORKOUT_HISTORY,
        AgentCapability.PROGRESS_TRACKING,
        AgentCapability.RECOVERY_GUIDANCE,
    }
)
# Nutrition summary also accepted for Progress tracking
_NUTRITION_CAPABILITIES: Final[frozenset[AgentCapability]] = frozenset(
    {
        AgentCapability.NUTRITION_ANALYSIS,
        AgentCapability.PROGRESS_TRACKING,
    }
)
# Exercise details also accepted for Knowledge retrieval
_EXERCISE_DETAILS_CAPABILITIES: Final[frozenset[AgentCapability]] = frozenset(
    {
        AgentCapability.EXERCISE_CATALOG,
        AgentCapability.KNOWLEDGE_RETRIEVAL,
    }
)


class MultiAgentMcpGateway:
    """Centralized, budget-aware, capability-gated tool gateway for multi-agent runs."""

    def __init__(
        self,
        *,
        budget_tracker: CumulativeBudgetTracker,
        mcp_handler: ToolCallback | None = None,
        native_handler: ToolCallback | None = None,
        discovered_tools: list[str] | None = None,
        allow_mutations: bool = False,
        durable_node_approval_verified: bool = False,
        initial_cache: dict[str, dict[str, Any]] | None = None,
    ) -> None:
        self._budget = budget_tracker
        self._mcp_handler = mcp_handler
        self._native_handler = native_handler
        self._allow_mutations = allow_mutations
        self._durable_node_approval_verified = durable_node_approval_verified
        self._discovered_tools = self._filter_trusted_tools(discovered_tools)
        self._cache: dict[str, dict[str, Any]] = dict(initial_cache or {})
        self._inflight_locks: dict[str, asyncio.Lock] = {}
        self._locks_guard = asyncio.Lock()
        self.cache_hits = 0
        self.fallbacks_triggered = 0
        self.executed_tools: list[str] = []

    def _filter_trusted_tools(self, discovered: list[str] | None) -> frozenset[str]:
        if discovered is None:
            return TRUSTED_READ_ONLY_TOOLS
        trusted = {t for t in discovered if t in TRUSTED_READ_ONLY_TOOLS}
        return frozenset(trusted)

    def discover_allowed_tools(self, agent_role: AgentRole) -> list[str]:
        """Return trusted, non-mutating tools authorized for `agent_role`."""
        role_allowlist = AGENT_TOOL_ALLOWLISTS.get(agent_role, frozenset())
        return sorted(role_allowlist & self._discovered_tools)

    def _has_capability_for_tool(
        self, tool_name: str, capabilities: list[AgentCapability]
    ) -> bool:
        cap_set = set(capabilities)
        if tool_name == TOOL_GET_FITNESS_PROFILE:
            return bool(cap_set & _PROFILE_CAPABILITIES)
        if tool_name == TOOL_GET_RECENT_WORKOUTS:
            return bool(cap_set & _WORKOUTS_CAPABILITIES)
        if tool_name == TOOL_GET_NUTRITION_SUMMARY:
            return bool(cap_set & _NUTRITION_CAPABILITIES)
        if tool_name == TOOL_GET_EXERCISE_DETAILS:
            return bool(cap_set & _EXERCISE_DETAILS_CAPABILITIES)
        req_cap = TOOL_REQUIRED_CAPABILITY.get(tool_name)
        return req_cap is not None and req_cap in cap_set

    def _sanitize_dict(self, payload: Any) -> Any:
        if isinstance(payload, str):
            return sanitize_multi_agent_text(payload)
        if isinstance(payload, list):
            return [self._sanitize_dict(item) for item in payload]
        if isinstance(payload, dict):
            return {k: self._sanitize_dict(v) for k, v in payload.items()}
        return payload

    async def execute_for_agent(
        self,
        *,
        agent_role: AgentRole,
        agent_capabilities: list[AgentCapability],
        tool_name: str,
        arguments: dict[str, Any],
        user_id: str,
        request_id: str,
    ) -> dict[str, Any]:
        """Authorize, validate, cache-dedup, and execute an allowed tool under shared quota."""
        uid = user_id.strip()
        if not uid:
            return {"error": "Authenticated user_id is required"}

        # 1. Mutation safeguard: keep mutation tools disabled without durable Node auth
        if tool_name in MUTATION_TOOLS and not (
            self._allow_mutations and self._durable_node_approval_verified
        ):
            return {
                "error": (
                    f"Tool '{tool_name}' is disabled: persistent mutations require "
                    "explicit user approval and Node.js authorization."
                )
            }

        # 2. Anti-confused-deputy check on raw arguments
        for forbidden_key in ("userId", "targetUserId", "user_id"):
            if forbidden_key in arguments:
                return {"error": f"Forbidden identity argument '{forbidden_key}' rejected"}

        # 3. Trusted discovery + per-agent allowlist + capability check
        role_allowlist = AGENT_TOOL_ALLOWLISTS.get(agent_role, frozenset())
        if tool_name not in self._discovered_tools or tool_name not in role_allowlist:
            return {
                "error": (
                    f"Authorization denied: agent '{agent_role.value}' "
                    f"cannot call '{tool_name}'"
                )
            }
        if not self._has_capability_for_tool(tool_name, agent_capabilities):
            return {
                "error": (
                    f"Capability denied: agent '{agent_role.value}' "
                    f"lacks capability for '{tool_name}'"
                )
            }

        # 4. Pydantic argument schema validation
        schema = TOOL_ARG_SCHEMAS.get(tool_name)
        validated_args = dict(arguments)
        if schema is not None:
            try:
                validated_args = schema.model_validate(arguments).model_dump(exclude_none=True)
            except ValidationError as exc:
                return sanitize_tool_error(tool_name, f"validation failed: {exc}")

        # 5. Request-scoped shared cache & in-flight deduplication (user-isolated)
        serialized_args = json.dumps(validated_args, sort_keys=True, separators=(",", ":"))
        sig = f"{uid}:{tool_name}:{serialized_args}"
        async with self._locks_guard:
            lock = self._inflight_locks.setdefault(sig, asyncio.Lock())

        async with lock:
            if sig in self._cache:
                self.cache_hits += 1
                return copy.deepcopy(self._cache[sig])

            # 6. Centralized cumulative quota reservation
            try:
                await self._budget.reserve_tool_call()
            except MultiAgentBudgetExceededError as exc:
                return {"error": exc.message}

            raw_result: dict[str, Any] | None = None
            mcp_security_blocked = False

            # 7. Execute via MCP handler first if present, with budget-aware native fallback
            if self._mcp_handler is not None:
                try:
                    raw_result = await self._mcp_handler(tool_name, validated_args)
                    if isinstance(raw_result, dict) and "error" in raw_result:
                        err_lower = str(raw_result["error"]).lower()
                        if any(
                            tok in err_lower
                            for tok in (
                                "forbidden",
                                "security",
                                "unauthorized",
                                "allowlist",
                                "validation",
                                "approval",
                            )
                        ):
                            mcp_security_blocked = True
                except Exception as exc:
                    logger.warning(
                        "MCP gateway call failed (%s); checking native fallback",
                        type(exc).__name__,
                        extra={"requestId": request_id},
                    )
                    raw_result = None

            needs_fallback = (
                not mcp_security_blocked
                and (raw_result is None or (isinstance(raw_result, dict) and "error" in raw_result))
                and self._native_handler is not None
                and not self._budget.is_deadline_approaching()
                and not self._budget.is_cancelled
            )
            if needs_fallback and self._native_handler is not None:
                self.fallbacks_triggered += 1
                try:
                    raw_result = await self._native_handler(tool_name, validated_args)
                except Exception as exc:
                    raw_result = sanitize_tool_error(tool_name, exc)

            if raw_result is None:
                raw_result = {"error": f"Tool '{tool_name}' unavailable"}

            sanitized = self._sanitize_dict(raw_result)
            if not isinstance(sanitized, dict):
                sanitized = {"result": sanitized}

            self.executed_tools.append(tool_name)
            if "error" not in sanitized:
                self._cache[sig] = copy.deepcopy(sanitized)
            return sanitized

    def export_cache_signatures(self) -> dict[str, dict[str, Any]]:
        """Export cache without user_id prefix for native fallback compatibility."""
        exported: dict[str, dict[str, Any]] = {}
        for key, val in self._cache.items():
            # key is "{uid}:{tool_name}:{json}" -> strip uid prefix
            parts = key.split(":", 1)
            if len(parts) == 2:
                exported[parts[1]] = copy.deepcopy(val)
        return exported
