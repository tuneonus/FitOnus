"""Pieces shared by several internal endpoints."""

from typing import Annotated

from pydantic import Field, StringConstraints, field_validator

from onusfit_ai.shared.contracts._base import ContractModel
from onusfit_ai.shared.utils.audio import (
    MAX_AUDIO_BASE64_CHARS,
    SUPPORTED_AUDIO_FORMATS,
    is_supported_audio_mime,
)
from onusfit_ai.shared.utils.image import MAX_IMAGE_BASE64_CHARS, SUPPORTED_IMAGE_MIME_TYPES

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


class AudioInput(ContractModel):
    """An audio clip as sent by the app: a MIME type and base64 text (raw, or a `data:` URL)."""

    mime_type: str = Field(min_length=1, max_length=100)
    base64: str = Field(min_length=1, max_length=MAX_AUDIO_BASE64_CHARS)

    @field_validator("mime_type")
    @classmethod
    def _supported_format(cls, value: str) -> str:
        if not is_supported_audio_mime(value):
            raise ValueError(
                f"unsupported audio format; supported: {', '.join(SUPPORTED_AUDIO_FORMATS)}"
            )
        return value


class ImageInput(ContractModel):
    """A photo as sent by the app: a MIME type and base64 text (raw, or a `data:` URL)."""

    mime_type: str = Field(min_length=1, max_length=100)
    base64: str = Field(min_length=1, max_length=MAX_IMAGE_BASE64_CHARS)

    @field_validator("mime_type")
    @classmethod
    def _supported_format(cls, value: str) -> str:
        if value not in SUPPORTED_IMAGE_MIME_TYPES:
            raise ValueError(
                f"unsupported image format; supported: {', '.join(SUPPORTED_IMAGE_MIME_TYPES)}"
            )
        return value
