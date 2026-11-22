"""Shared base contracts and types."""

from onusfit_ai.shared.contracts._base import ContractModel
from onusfit_ai.shared.contracts.common import (
    AudioInput,
    ImageInput,
    ModelName,
    ModelSelection,
    Usage,
)
from onusfit_ai.shared.contracts.embed import (
    EmbedRequest,
    EmbedResponse,
    EmbedTaskType,
)

__all__ = [
    "AudioInput",
    "ContractModel",
    "EmbedRequest",
    "EmbedResponse",
    "EmbedTaskType",
    "ImageInput",
    "ModelName",
    "ModelSelection",
    "Usage",
]
