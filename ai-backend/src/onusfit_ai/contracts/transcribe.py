"""Contract for POST /internal/v1/ai/speech/transcribe.

Mirrors the existing public response (`transcribeResponseSchema` in the Node coach module):
`{transcript, detectedLanguage}`. Node has already authenticated and rate-limited the caller.
"""

from typing import Literal

from pydantic import Field

from onusfit_ai.contracts._base import ContractModel
from onusfit_ai.contracts.common import AudioInput, ModelSelection, Usage


class TranscribeRequest(ContractModel):
    audio: AudioInput
    model: ModelSelection
    deadline_ms: int = Field(ge=1000, le=30000)


class TranscribeResult(ContractModel):
    transcript: str
    detected_language: str


class TranscribeResponse(ContractModel):
    # "ok": the model returned the expected JSON. "unstructured": it did not, so the raw text was
    # used as the transcript (what Node did silently; the flag makes it countable).
    outcome: Literal["ok", "unstructured"]
    result: TranscribeResult
    usage: Usage
    trace_id: str
