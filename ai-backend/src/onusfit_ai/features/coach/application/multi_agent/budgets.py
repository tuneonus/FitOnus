"""Cumulative request-level budget enforcement, deterministic safety, and cancellation.

Enforces single shared budgets across the supervisor and all delegated specialist agents:
- Agent invocations, LLM calls, input/output/total tokens, tool calls
- Delegation depth and replanning attempts
- Execution deadline and bounded concurrency
- Deterministic medical red-flag checks and prompt-injection sanitization
"""

import asyncio
import re
import time
from collections.abc import Callable
from typing import Final

from onusfit_ai.features.coach.application.prompts.coach_chat import (
    sanitize_context_untrusted_text,
)
from onusfit_ai.features.coach.domain.multi_agent import (
    BudgetUsageSnapshot,
    MultiAgentExecutionBudget,
)

# Deterministic clinical red flags requiring medical disclaimer & workout intensity halt
_RED_FLAG_PATTERNS: Final[list[re.Pattern[str]]] = [
    re.compile(r"\b(chest\s+pain|angina|cardiac|tight\s+chest)\b", re.IGNORECASE),
    re.compile(
        r"\b(fractur\w*|broken\s+bone|acute\s+(\w+\s+)?tear|severe\s+sharp\s+pain)\b",
        re.IGNORECASE,
    ),
    re.compile(r"\b(dizziness|faint\w*|syncope|vertigo|blackout\w*)\b", re.IGNORECASE),
    re.compile(r"\b(post[\s-]surgery|unhealed\s+wound)\b", re.IGNORECASE),
    re.compile(r"\b(numbness|tingling|radiating\s+pain)\b", re.IGNORECASE),
]

_INJECTION_PATTERNS: Final[list[re.Pattern[str]]] = [
    re.compile(r"(?i)\b(?:ignore\s+(?:all\s+)?previous\s+instructions?)\b"),
    re.compile(r"(?i)\b(?:system\s+instruction|critical\s+rules|override\s+rules)\s*:"),
    re.compile(r"</?(?:system|grounding_observations|retrieved_knowledge|context_manifest)[^>]*>"),
]

_CREDENTIAL_PATTERNS: Final[list[re.Pattern[str]]] = [
    re.compile(r"Bearer\s+[A-Za-z0-9\-_=.]+\.[A-Za-z0-9\-_=.]+\.?[A-Za-z0-9\-_=.]*"),
    re.compile(r"\beyJ[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.?[A-Za-z0-9\-_=]*"),
]


class MultiAgentBudgetExceededError(Exception):
    """Raised internally when a cumulative multi-agent budget limit is reached."""

    def __init__(self, reason_code: str, message: str) -> None:
        super().__init__(message)
        self.reason_code = reason_code
        self.message = message


def detect_medical_red_flags_text(text: str, extra_items: list[str] | None = None) -> list[str]:
    """Deterministically detect clinical red flags from user query and approved limitations."""
    combined = text
    if extra_items:
        combined = f"{combined} {' '.join(extra_items)}"
    flags: list[str] = []
    for pattern in _RED_FLAG_PATTERNS:
        match = pattern.search(combined)
        if match:
            flags.append(
                f"Clinical red flag detected ('{match.group(0)}'); "
                "consult a physician or healthcare provider before exercising."
            )
    return flags


def sanitize_multi_agent_text(raw: str) -> str:
    """Neutralize delimiter breakouts, override headers, and embedded credential tokens."""
    if not raw:
        return ""
    cleaned = sanitize_context_untrusted_text(raw)
    for pattern in _CREDENTIAL_PATTERNS:
        cleaned = pattern.sub("[REDACTED_AUTH_TOKEN]", cleaned)
    return cleaned


def contains_prompt_injection(text: str) -> bool:
    """Return True if raw untrusted text contains direct prompt-injection directives."""
    return any(p.search(text) for p in _INJECTION_PATTERNS)


def validate_nutrition_safety_bounds(target_calories: int | float | None) -> str | None:
    """Reject dangerously restrictive caloric prescriptions deterministically."""
    if target_calories is not None and target_calories < 1200:
        return (
            f"Refused unsafe extreme calorie target ({target_calories} kcal/day < 1200 kcal floor)"
        )
    return None


class CumulativeBudgetTracker:
    """Async-safe request-level budget tracker shared across all agents and tool calls."""

    def __init__(
        self,
        budget: MultiAgentExecutionBudget | None = None,
        *,
        clock: Callable[[], float] = time.monotonic,
        start_time: float | None = None,
        deadline: float | None = None,
    ) -> None:
        self.budget = budget or MultiAgentExecutionBudget()
        self._clock = clock
        self.start_time = start_time if start_time is not None else self._clock()
        self.deadline = (
            deadline if deadline is not None else (self.start_time + self.budget.deadline_seconds)
        )
        self._lock = asyncio.Lock()
        self.concurrency_semaphore = asyncio.Semaphore(self.budget.max_concurrent_agents)

        self.agent_invocations = 0
        self.llm_calls = 0
        self.input_tokens = 0
        self.output_tokens = 0
        self.total_tokens = 0
        self.tool_calls = 0
        self.replanning_attempts = 0
        self.max_depth_observed = 0
        self.exhausted_reason: str | None = None

        self._cancelled = False
        self._cancel_reason: str | None = None

    def cancel(self, reason: str = "request_cancelled") -> None:
        """Propagate cooperative cancellation across all active multi-agent tasks."""
        self._cancelled = True
        self._cancel_reason = reason

    @property
    def is_cancelled(self) -> bool:
        return self._cancelled

    @property
    def cancel_reason(self) -> str | None:
        return self._cancel_reason

    def remaining_seconds(self) -> float:
        return max(0.0, self.deadline - self._clock())

    def is_deadline_approaching(self) -> bool:
        return (self.deadline - self._clock()) < self.budget.deadline_margin_s

    async def reserve_agent_invocation(self, depth: int = 1) -> None:
        """Reserve one specialist invocation slot within cumulative limits."""
        async with self._lock:
            if self._cancelled:
                raise MultiAgentBudgetExceededError(
                    "cancelled", self._cancel_reason or "Workflow cancelled"
                )
            if self.is_deadline_approaching():
                self.exhausted_reason = "deadline_approaching"
                raise MultiAgentBudgetExceededError(
                    "deadline_approaching", "Execution deadline approaching"
                )
            if depth > self.budget.max_delegation_depth:
                self.exhausted_reason = "max_delegation_depth_reached"
                raise MultiAgentBudgetExceededError(
                    "max_delegation_depth_reached",
                    f"Delegation depth {depth} exceeds max {self.budget.max_delegation_depth}",
                )
            if self.agent_invocations >= self.budget.max_agent_invocations:
                self.exhausted_reason = "max_agent_invocations_reached"
                raise MultiAgentBudgetExceededError(
                    "max_agent_invocations_reached",
                    f"Agent invocation cap ({self.budget.max_agent_invocations}) reached",
                )
            self.agent_invocations += 1
            self.max_depth_observed = max(self.max_depth_observed, depth)

    async def reserve_tool_call(self) -> None:
        """Reserve one actual external tool execution within cumulative quota."""
        async with self._lock:
            if self._cancelled:
                raise MultiAgentBudgetExceededError(
                    "cancelled", self._cancel_reason or "Workflow cancelled"
                )
            if self.is_deadline_approaching():
                self.exhausted_reason = "deadline_approaching"
                raise MultiAgentBudgetExceededError(
                    "deadline_approaching", "Execution deadline approaching"
                )
            if self.tool_calls >= self.budget.max_tool_calls:
                self.exhausted_reason = "max_tool_calls_reached"
                raise MultiAgentBudgetExceededError(
                    "max_tool_calls_reached",
                    f"Cumulative tool call cap ({self.budget.max_tool_calls}) reached",
                )
            self.tool_calls += 1

    async def reserve_llm_call(self) -> None:
        """Reserve one LLM generation call within cumulative request limits."""
        async with self._lock:
            if self._cancelled:
                raise MultiAgentBudgetExceededError(
                    "cancelled", self._cancel_reason or "Workflow cancelled"
                )
            if self.is_deadline_approaching():
                self.exhausted_reason = "deadline_approaching"
                raise MultiAgentBudgetExceededError(
                    "deadline_approaching", "Execution deadline approaching"
                )
            if self.llm_calls >= self.budget.max_llm_calls:
                self.exhausted_reason = "max_llm_calls_reached"
                raise MultiAgentBudgetExceededError(
                    "max_llm_calls_reached",
                    f"Cumulative LLM call cap ({self.budget.max_llm_calls}) reached",
                )
            if self.total_tokens >= self.budget.max_total_tokens:
                self.exhausted_reason = "token_budget_exceeded"
                raise MultiAgentBudgetExceededError(
                    "token_budget_exceeded",
                    f"Cumulative token budget ({self.budget.max_total_tokens}) exhausted",
                )
            self.llm_calls += 1

    async def record_tokens(self, *, input_tokens: int, output_tokens: int, total: int) -> None:
        """Record actual token consumption from an LLM response."""
        async with self._lock:
            self.input_tokens += max(0, input_tokens)
            self.output_tokens += max(0, output_tokens)
            self.total_tokens += max(0, total)
            if (
                self.input_tokens > self.budget.max_input_tokens
                or self.output_tokens > self.budget.max_output_tokens
                or self.total_tokens > self.budget.max_total_tokens
            ):
                self.exhausted_reason = "token_budget_exceeded"

    async def reserve_replan(self) -> bool:
        """Attempt to reserve a replanning cycle; returns False if cap exhausted."""
        async with self._lock:
            if (
                self._cancelled
                or self.is_deadline_approaching()
                or self.replanning_attempts >= self.budget.max_replanning_attempts
            ):
                return False
            self.replanning_attempts += 1
            return True

    def snapshot(self) -> BudgetUsageSnapshot:
        """Return an immutable snapshot of current cumulative usage."""
        elapsed_ms = round(max(0.0, (self._clock() - self.start_time) * 1000.0), 2)
        return BudgetUsageSnapshot(
            agent_invocations=self.agent_invocations,
            llm_calls=self.llm_calls,
            input_tokens=self.input_tokens,
            output_tokens=self.output_tokens,
            total_tokens=self.total_tokens,
            tool_calls=self.tool_calls,
            replanning_attempts=self.replanning_attempts,
            max_depth_observed=self.max_depth_observed,
            elapsed_ms=elapsed_ms,
            exhausted_reason=self.exhausted_reason,
        )

