"""The Node <-> Python wire contract, pinned as a list of field paths (audit M7).

Node mirrors every request and response model by hand (zod schemas, adapters, test fakes), and the
Python requests use `extra="forbid"`: one field added on one side only makes the feature fail. This test
turns the Pydantic models into `tests/fixtures/contracts/wire_fields.json`, a flat `path -> required`
map. If you change a contract the test fails here; then

  1. regenerate the snapshot:  UPDATE_CONTRACT_SNAPSHOT=1 .venv/bin/python -m pytest tests/test_wire_contract.py
  2. update Node to match (zod schema, adapter, fake reply). backend/tests/unit/ai/python-wire-contract
     .test.ts reads the same file and drives the real adapters against it, so it fails until you do.

Paths use `.` for objects and `[]` for arrays (`context.recentWorkouts[].name`). `open` lists free-form
objects (`dict[str, Any]`) whose inside is not part of the contract.
"""

import json
import os
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from onusfit_ai.features.coach.domain import (
    CoachChatRequest,
    CoachChatResponse,
    CoachInsightsRequest,
    CoachInsightsResponse,
)
from onusfit_ai.features.meals.domain import (
    AnalyzeMealPhotoRequest,
    AnalyzeMealPhotoResponse,
    ParseVoiceMealRequest,
    ParseVoiceMealResponse,
)
from onusfit_ai.features.speech.application.contracts import TranscribeRequest, TranscribeResponse

SNAPSHOT = Path(__file__).parent / "fixtures" / "contracts" / "wire_fields.json"

ENDPOINTS: dict[str, tuple[type[BaseModel], type[BaseModel]]] = {
    "coach_chat": (CoachChatRequest, CoachChatResponse),
    "coach_insights": (CoachInsightsRequest, CoachInsightsResponse),
    "voice_meal": (ParseVoiceMealRequest, ParseVoiceMealResponse),
    "meal_photo": (AnalyzeMealPhotoRequest, AnalyzeMealPhotoResponse),
    "transcribe": (TranscribeRequest, TranscribeResponse),
}


def _resolve(node: dict[str, Any], defs: dict[str, Any]) -> dict[str, Any]:
    while "$ref" in node:
        node = defs[node["$ref"].rsplit("/", 1)[-1]]
    return node


def _walk(
    node: dict[str, Any],
    prefix: str,
    defs: dict[str, Any],
    fields: dict[str, bool],
    open_: set[str],
) -> None:
    node = _resolve(node, defs)
    if "anyOf" in node:  # `X | None`: describe X. A union of several real types is a leaf.
        branches = [b for b in node["anyOf"] if b.get("type") != "null"]
        if len(branches) != 1:
            return
        node = _resolve(branches[0], defs)
    if node.get("type") == "object":
        if "properties" not in node:
            open_.add(prefix)  # dict[str, Any]: free-form
            return
        required = set(node.get("required", []))
        for name, child in node["properties"].items():
            path = f"{prefix}.{name}" if prefix else name
            fields[path] = name in required
            _walk(child, path, defs, fields, open_)
    elif node.get("type") == "array" and "items" in node:
        element = f"{prefix}[]"
        fields[element] = False  # only present when the array has elements
        _walk(node["items"], element, defs, fields, open_)


def describe(model: type[BaseModel], mode: str) -> dict[str, Any]:
    schema = model.model_json_schema(by_alias=True, mode=mode)  # type: ignore[arg-type]
    fields: dict[str, bool] = {}
    open_: set[str] = set()
    _walk(schema, "", schema.get("$defs", {}), fields, open_)
    return {"fields": dict(sorted(fields.items())), "open": sorted(open_)}


def build_snapshot() -> dict[str, Any]:
    return {
        name: {
            "request": describe(request, "validation"),
            "response": describe(response, "serialization"),
        }
        for name, (request, response) in ENDPOINTS.items()
    }


def test_the_wire_contract_matches_the_committed_snapshot() -> None:
    actual = build_snapshot()
    if os.environ.get("UPDATE_CONTRACT_SNAPSHOT") == "1":
        SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
        SNAPSHOT.write_text(json.dumps(actual, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    expected = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    assert actual == expected, (
        "A Node<->Python request/response model changed. Regenerate tests/fixtures/contracts/"
        "wire_fields.json (UPDATE_CONTRACT_SNAPSHOT=1) and update the Node adapters, zod schemas and "
        "fake replies in backend/ to match; backend/tests/unit/ai/python-wire-contract.test.ts checks them."
    )


def test_the_snapshot_describes_the_fields_the_node_adapters_rely_on() -> None:
    # Guards the generator itself: if it silently returned nothing, the Node test would pass vacuously.
    snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    chat = snapshot["coach_chat"]
    assert chat["request"]["fields"]["context.profile.displayName"] is True
    assert chat["request"]["fields"]["context.profile.sex"] is False
    assert chat["request"]["fields"]["context.recentWorkouts[].name"] is True
    assert "result.blocks[]" in chat["response"]["open"]
    assert snapshot["voice_meal"]["response"]["fields"]["result.items[].kcal"] is True
    assert set(snapshot) == set(ENDPOINTS)
