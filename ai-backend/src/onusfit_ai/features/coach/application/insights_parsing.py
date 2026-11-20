"""Turns Gemini's raw text into coach insights, or says it cannot.

Ported 1:1 from `parseInsightsOutput` in the former Node GeminiCoachInsightsService, including its
quirks (`String(x || default)`, the enum allow-lists, `Boolean(x)`, a `null` item breaking the whole
reply). The one behavioral difference by design: where Node then built its deterministic insights,
this returns `None` and Node (which keeps that fallback) does it. tests/fixtures/coach_insights/
parse_cases.json holds 39 replies rendered by the Node code.

Unlike the other parsers, the reply is NOT trimmed here (Node did not either): a reply with text
before the code fence is unusable. In production the text is trimmed before it gets here.
"""

import re
from datetime import UTC, datetime
from typing import Any, Literal

from onusfit_ai.features.coach.domain.insights import InsightItem, InsightsResult
from onusfit_ai.shared.utils.js_compat import (
    js_or,
    js_prop,
    js_string,
    js_truthy,
    strict_json_loads,
)

InsightsOutcome = Literal["ok", "unusable"]

_CATEGORIES = ("workout", "nutrition", "hydration", "goal", "recovery")
_PRIORITIES = ("high", "medium", "low")
_SEVERITIES = ("positive", "watch", "info")
_CONFIDENCES = ("high", "medium", "low")


def _now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _strip_fences_like_node(raw: str) -> str:
    """Strip a leading ```json (or ```) fence and the closing one, without trimming first."""
    for opener in ("```json", "```"):
        if raw.startswith(opener):
            without_opener = re.sub(rf"^{opener}\s*", "", raw, count=1)
            return re.sub(r"\s*```\Z", "", without_opener, count=1)
    return raw


def _choice(value: Any, allowed: tuple[str, ...], default: str) -> str:
    return value if isinstance(value, str) and value in allowed else default


def _parse_item(item: Any, index: int, now_ms: int) -> InsightItem:
    raw_id = js_prop(item, "id")
    evidence = js_prop(item, "evidence")
    return InsightItem(
        id=raw_id if isinstance(raw_id, str) and raw_id else f"ins-{now_ms}-{index}",
        title=js_string(js_or(js_prop(item, "title"), "Fitness Insight")),
        description=js_string(js_or(js_prop(item, "description"), "")),
        category=_choice(js_prop(item, "category"), _CATEGORIES, "workout"),  # type: ignore[arg-type]
        priority=_choice(js_prop(item, "priority"), _PRIORITIES, "medium"),  # type: ignore[arg-type]
        severity=_choice(js_prop(item, "severity"), _SEVERITIES, "info"),  # type: ignore[arg-type]
        action=js_string(js_or(js_prop(item, "action"), "Ask Coach")),
        question=js_string(js_or(js_prop(item, "question"), "How can I improve my progress?")),
        evidence=[js_string(entry) for entry in evidence] if isinstance(evidence, list) else [],
        confidence=_choice(js_prop(item, "confidence"), _CONFIDENCES, "high"),  # type: ignore[arg-type]
        requires_device=js_truthy(js_prop(item, "requiresDevice")),
    )


def parse_insights_output(
    raw_text: str, display_name: str
) -> tuple[InsightsResult | None, InsightsOutcome]:
    try:
        parsed = strict_json_loads(_strip_fences_like_node(raw_text))
        raw_insights = js_prop(parsed, "insights")
        if isinstance(raw_insights, list) and len(raw_insights) > 0:
            now_ms = int(datetime.now(UTC).timestamp() * 1000)
            items = [_parse_item(item, index, now_ms) for index, item in enumerate(raw_insights)]
            greeting = js_prop(parsed, "greeting")
            recommendation = js_prop(parsed, "recommendation")
            result = InsightsResult(
                greeting=greeting if isinstance(greeting, str) else f"Hello, {display_name}!",
                recommendation=recommendation if isinstance(recommendation, str) else None,
                insights=items,
                generated_at=_now_iso(),
                has_sufficient_data=True,
            )
            return result, "ok"
    except (ValueError, TypeError, OverflowError):
        pass
    return None, "unusable"
