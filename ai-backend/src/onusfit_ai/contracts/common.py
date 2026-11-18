"""Pieces shared by several internal endpoints."""

from typing import Annotated

from pydantic import StringConstraints

from onusfit_ai.contracts._base import ContractModel

ModelName = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9._-]{1,64}$")]


class ModelSelection(ContractModel):
    """Chosen by Node from the admin console's Gemini configuration; Python does not read the DB."""

    primary: ModelName
    fallback: ModelName | None = None


class Usage(ContractModel):
    """What the call cost, so Node can write it to the usage ledger."""

    model: str
    is_fallback: bool
    input_tokens: int
    output_tokens: int
    cached_tokens: int
    thinking_tokens: int
    total_tokens: int
    duration_ms: int
