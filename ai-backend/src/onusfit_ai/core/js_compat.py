"""Small helpers that reproduce JavaScript's behavior where the old Node code relied on it.

The Node implementation did `Number(x) || 0`, `Math.round(...)`, `String(x)` and `a || b` on values
coming from an LLM's JSON. Python differs in subtle ways (banker's rounding, compensated `sum`,
`[]` being falsy, `str(True)`), so the migrated parsers use these helpers to give identical results.
Each helper is covered by tests/test_js_compat.py and by golden files rendered by the Node code.
"""

import json
import math
from decimal import Decimal
from typing import Any


def js_num(value: float | int | None) -> str:
    """Format a number the way JavaScript's `String(n)` does (72.0 -> "72", 1e21 -> "1e+21").

    JavaScript switches to exponent notation only at 1e21 and below 1e-6, and writes the exponent
    without padding ("1e-7"); Python's `str` switches much earlier ("1e-05") and pads.
    """
    if value is None:
        return "null"
    if isinstance(value, float):
        if not math.isfinite(value):
            return "NaN" if math.isnan(value) else ("Infinity" if value > 0 else "-Infinity")
        magnitude = abs(value)
        if magnitude >= 1e21 or 0 < magnitude < 1e-6:
            mantissa, _, exponent = repr(value).partition("e")
            sign = "-" if exponent.startswith("-") else "+"
            return f"{mantissa}e{sign}{exponent.lstrip('+-').lstrip('0')}"
        # Shortest round-trip digits like JavaScript, written as a plain decimal (no exponent).
        text = format(Decimal(repr(value)), "f")
        return text.rstrip("0").rstrip(".") if "." in text else text
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


def js_nullish(value: Any, default: str) -> str:
    """A template-literal `${value ?? default}`: only null falls back; 0 and "" are kept."""
    if value is None:
        return default
    return js_num(value) if isinstance(value, (int, float)) else str(value)


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


def _reject_constant(name: str) -> Any:
    raise ValueError(f"invalid JSON constant {name}")


def strict_json_loads(text: str) -> Any:
    """`JSON.parse`: raises ValueError for invalid JSON, including NaN / Infinity literals
    (Python's json module would accept them)."""
    return json.loads(text, parse_constant=_reject_constant)


def js_prop(value: Any, key: str) -> Any:
    """`value.key` in JavaScript: undefined for primitives and arrays, a TypeError for null."""
    if value is None:
        raise TypeError(f"cannot read '{key}' of null")
    return value.get(key) if isinstance(value, dict) else None


def strip_code_fences(raw: str) -> str:
    """Removes a leading ```json (or ```) fence and the trailing ``` that models often add."""
    cleaned = raw.strip()
    for opener in ("```json", "```"):
        if cleaned.startswith(opener):
            cleaned = cleaned[len(opener) :].lstrip()
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3].rstrip()
            break
    return cleaned
