"""The Python parser must give the same results as the former Node `parseInsightsOutput`.

tests/fixtures/coach_insights/parse_cases.json holds 39 raw model replies and what the Node code
produced for each (ids and timestamps normalised). Where Node fell back to deterministic insights the
case is `usable: false` and Python must return `None` (Node, which keeps that fallback, does the rest).
"""

import json
import re
from typing import Any

import pytest

from conftest import INSIGHTS_FIXTURES
from onusfit_ai.coach.insights_parsing import parse_insights_output

CASES = json.loads((INSIGHTS_FIXTURES / "parse_cases.json").read_text(encoding="utf-8"))


def normalise(result: Any) -> dict[str, Any]:
    data = json.loads(result.model_dump_json(by_alias=True))
    data["generatedAt"] = "GENERATED_AT"
    for item in data["insights"]:
        item["id"] = re.sub(r"^ins-\d+-", "ins-TS-", item["id"])
    return data


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_parse_matches_node_golden(case: dict[str, Any]) -> None:
    result, outcome = parse_insights_output(case["raw"], case["displayName"])
    if case["usable"]:
        assert outcome == "ok" and result is not None
        assert normalise(result) == case["expected"]
    else:
        assert (result, outcome) == (None, "unusable")


def test_the_corpus_covers_both_kinds_of_outcome() -> None:
    assert sum(c["usable"] for c in CASES) >= 15 and sum(not c["usable"] for c in CASES) >= 15


def test_generated_ids_are_unique_per_item() -> None:
    case = next(c for c in CASES if c["name"] == "item_ids_missing_or_bad")
    result, _ = parse_insights_output(case["raw"], case["displayName"])
    assert result is not None
    ids = [item.id for item in result.insights]
    assert len(set(ids)) == 4 and ids[-1] == "keep-me"


def test_a_reply_that_is_not_valid_json_never_raises() -> None:
    for raw in ("", "```", "```json", "{", "[[[", "\x00", '{"insights": [{"title": 1e999}]}'):
        result, outcome = parse_insights_output(raw, "Anu")
        assert outcome in ("ok", "unusable")
        assert (result is None) == (outcome == "unusable")
