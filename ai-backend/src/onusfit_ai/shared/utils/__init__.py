"""Shared utility functions."""

from onusfit_ai.shared.utils.audio import (
    MAX_AUDIO_BASE64_CHARS,
    SUPPORTED_AUDIO_FORMATS,
    decode_audio_base64,
    is_supported_audio_mime,
)
from onusfit_ai.shared.utils.image import (
    MAX_IMAGE_BASE64_CHARS,
    SUPPORTED_IMAGE_MIME_TYPES,
    decode_image_base64,
    looks_like_supported_image,
)
from onusfit_ai.shared.utils.js_compat import (
    js_nullish,
    js_num,
    js_number,
    js_or,
    js_prop,
    js_round,
    js_string,
    js_truthy,
    number_or,
    strict_json_loads,
    strip_code_fences,
)
from onusfit_ai.shared.utils.text import clean_prompt_text, clean_text

__all__ = [
    "MAX_AUDIO_BASE64_CHARS",
    "SUPPORTED_AUDIO_FORMATS",
    "decode_audio_base64",
    "is_supported_audio_mime",
    "MAX_IMAGE_BASE64_CHARS",
    "SUPPORTED_IMAGE_MIME_TYPES",
    "decode_image_base64",
    "looks_like_supported_image",
    "js_nullish",
    "js_num",
    "js_number",
    "js_or",
    "js_prop",
    "js_round",
    "js_string",
    "js_truthy",
    "number_or",
    "strict_json_loads",
    "strip_code_fences",
    "clean_prompt_text",
    "clean_text",
]
