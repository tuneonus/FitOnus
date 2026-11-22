"""Generation schema for Gemini Structured Outputs in speech transcription."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class GeminiTranscribeOutput(BaseModel):
    """Schema enforced on Gemini for speech transcription."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    transcript: str = Field(
        default="",
        description=(
            "Exact transcription of the spoken words. "
            "Preserves Tamil script or Tanglish phonetics exactly as spoken."
        ),
    )
    detected_language: Literal["en", "ta", "tanglish"] = Field(
        default="en",
        description=(
            "Language detected: 'en' for English, 'ta' for Tamil script, "
            "'tanglish' for Tamil in Latin letters."
        ),
    )
