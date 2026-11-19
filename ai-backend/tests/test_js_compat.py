import math

import pytest

from onusfit_ai.core.js_compat import (
    js_num,
    js_number,
    js_or,
    js_round,
    js_string,
    js_truthy,
    number_or,
)


@pytest.mark.parametrize(
    ("value", "expected"), [(2.5, 3), (3.5, 4), (0.5, 1), (12.5, 13), (-0.4, 0), (2.4, 2)]
)
def test_round_halves_go_up_like_math_round(value: float, expected: int) -> None:
    assert js_round(value) == expected  # Python's round(2.5) would be 2


def test_round_refuses_non_finite() -> None:
    with pytest.raises(ValueError):
        js_round(math.inf)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, 0.0),
        (True, 1.0),
        (False, 0.0),
        (5, 5.0),
        ("260", 260.0),
        (" 12 ", 12.0),
        ("", 0.0),
        ([], 0.0),
        ([7], 7.0),
        ("1e3", 1000.0),
    ],
)
def test_number_converts_like_javascript(value: object, expected: float) -> None:
    assert js_number(value) == expected


@pytest.mark.parametrize("value", ["abc", {}, [1, 2], "12px"])
def test_number_is_nan_when_not_convertible(value: object) -> None:
    assert math.isnan(js_number(value))


def test_number_or_falls_back_for_nan_and_zero() -> None:
    assert number_or("abc", 100) == 100
    assert number_or(0, 100) == 100
    assert number_or(None, 1) == 1
    assert number_or("160", 100) == 160
    assert number_or(-3, 0) == -3


def test_truthiness_differs_from_python_for_empty_containers() -> None:
    assert js_truthy([]) and js_truthy({})
    assert (
        not js_truthy(math.nan) and not js_truthy("") and not js_truthy(0) and not js_truthy(None)
    )
    assert js_or("", 0, "x") == "x"
    assert js_or([], "x") == []


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, "null"),
        (True, "true"),
        (False, "false"),
        (5.0, "5"),
        (5.5, "5.5"),
        ([1, None, "a"], "1,,a"),
        ({}, "[object Object]"),
        ("text", "text"),
    ],
)
def test_string_matches_javascript(value: object, expected: str) -> None:
    assert js_string(value) == expected


def test_num_formatting() -> None:
    assert (js_num(72.0), js_num(72.5), js_num(None), js_num(3)) == ("72", "72.5", "null", "3")


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (72.0, "72"),
        (72.5, "72.5"),
        (0.00001, "0.00001"),  # Python's str() would give 1e-05
        (0.000001, "0.000001"),
        (1e-7, "1e-7"),  # Python's repr() gives 1e-07
        (1.5e-7, "1.5e-7"),
        (123456789012345680000.0, "123456789012345680000"),
        (1e21, "1e+21"),
        (1.5e21, "1.5e+21"),
        (-1e21, "-1e+21"),
        (float("inf"), "Infinity"),
        (7, "7"),
    ],
)
def test_number_to_string_matches_javascript(value: float, expected: str) -> None:
    assert js_num(value) == expected
