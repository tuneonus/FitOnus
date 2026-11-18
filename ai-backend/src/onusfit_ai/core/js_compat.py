"""Small helpers that reproduce JavaScript's behavior where the old Node code relied on it.

The Node implementation did `Number(x) || 0`, `Math.round(...)`, `String(x)` and `a || b` on values
coming from an LLM's JSON. Python differs in subtle ways (banker's rounding, compensated `sum`,
`[]` being falsy, `str(True)`), so the migrated parsers use these helpers to give identical results.
Each helper is covered by tests/test_js_compat.py and by golden files rendered by the Node code.
"""

import math
from typing import Any


def js_num(value: float | int | None) -> str:
    """Format a number the way a JavaScript template literal does (72.0 -> "72", 72.5 -> "72.5")."""
    if value is None:
        return "null"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def js_string(value: Any) -> str:
    """JavaScript's `String(value)` for JSON values."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return js_num(value)
    if isinstance(value, list):
        return ",".join("" if v is None else js_string(v) for v in value)
    if isinstance(value, dict):
        return "[object Object]"
    return str(value)


def js_truthy(value: Any) -> bool:
    """JavaScript truthiness: unlike Python, empty lists and objects are truthy; NaN is falsy."""
    if isinstance(value, (list, dict)):
        return True
    if isinstance(value, float) and math.isnan(value):
        return False
    return bool(value)


def js_or(*values: Any) -> Any:
    """`a || b || c`: the first truthy value, else the last one."""
    for value in values[:-1]:
        if js_truthy(value):
            return value
    return values[-1]


def js_number(value: Any) -> float:
    """JavaScript's `Number(value)`: NaN when it cannot be converted."""
    if value is None:
        return 0.0
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        text = value.strip()
        if text == "":
            return 0.0
        try:
            return float(text)
        except ValueError:
            return math.nan
    if isinstance(value, list):
        if len(value) == 0:
            return 0.0
        return js_number(value[0]) if len(value) == 1 else math.nan
    return math.nan


def number_or(value: Any, default: float) -> float:
    """`Number(value) || default`: NaN and 0 both fall back to the default."""
    number = js_number(value)
    return default if (math.isnan(number) or number == 0) else number


def js_round(value: float) -> int:
    """`Math.round`: halves round up (2.5 -> 3), unlike Python's round-half-to-even."""
    if not math.isfinite(value):
        raise ValueError("cannot round a non-finite number")
    return math.floor(value + 0.5)
