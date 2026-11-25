"""Audio rules shared by every endpoint that accepts an audio clip.

Mirror of the rules the Node API applies (`ParseVoiceMealUseCase`): the same allow-list, the same
lenient match (so `audio/x-m4a` and `audio/mp4; codecs=mp4a` pass), and a 15 MB cap measured on the
base64 text. Python re-checks them, rejects disguised non-audio binaries, and validates container
duration caps when audio headers exist before calling Gemini.
"""

import base64
import binascii
import struct
from dataclasses import dataclass

from onusfit_ai.shared.utils.media import InvalidMediaError

# `audio/m4a` -> "m4a": a MIME type is accepted if it contains any of these.
SUPPORTED_AUDIO_FORMATS = ("m4a", "mp4", "aac", "wav", "webm", "ogg", "mpeg", "3gpp")
# ~11.25 MiB binary at 15 MiB base64 (plenty for a 60s voice note) without blowing worker memory.
MAX_AUDIO_BASE64_CHARS = 15 * 1024 * 1024
MAX_AUDIO_BYTES = 12 * 1024 * 1024
MAX_AUDIO_DURATION_SECONDS = 65.0

_UNSAFE_AUDIO_PREFIXES = (
    b"%pdf-",
    b"\x7felf",
    b"pk\x03\x04",
    b"mz\x90",
    b"\xff\xd8\xff",
    b"\x89png\r\n\x1a\n",
    b"gif87a",
    b"gif89a",
    b"<svg",
    b"<html",
    b"<!doctype",
    b"<script",
    b"<?xml",
    b"#!/",
)
_DISALLOWED_MIME_PREFIXES = ("image/", "text/", "multipart/", "font/")


@dataclass(frozen=True)
class AudioInspection:
    """Validated metadata extracted from raw audio bytes."""

    mime_type: str
    byte_length: int
    duration_seconds: float | None


def normalize_audio_mime(mime_type: str) -> str:
    """Strip codec parameters and normalize common audio aliases."""
    base = mime_type.split(";", 1)[0].strip().lower()
    if base in ("audio/x-m4a", "audio/m4a"):
        return "audio/m4a"
    if base in ("audio/x-wav", "audio/wave"):
        return "audio/wav"
    if base == "audio/mp3":
        return "audio/mpeg"
    return base


def is_supported_audio_mime(mime_type: str) -> bool:
    """Return True when the MIME type belongs to a supported audio container format."""
    base = mime_type.split(";", 1)[0].strip().lower()
    if not base or base.startswith(_DISALLOWED_MIME_PREFIXES):
        return False
    return any(fmt in base for fmt in SUPPORTED_AUDIO_FORMATS)


def _has_unsafe_audio_bytes(data: bytes) -> bool:
    """Block executables, documents, markup, and disguised images before calling Gemini."""
    head = data[:512].lstrip().lower()
    if any(head.startswith(prefix) for prefix in _UNSAFE_AUDIO_PREFIXES):
        return True
    if data[:4] == b"RIFF" and len(data) >= 12 and data[8:12] == b"WEBP":
        return True
    if any(marker in head for marker in (b"<script", b"<svg", b"<?php")):
        return True
    return False


def estimate_audio_duration_seconds(data: bytes) -> float | None:
    """Estimate duration in seconds for standard WAV, MP4/M4A, or Ogg Opus containers."""
    if len(data) >= 44 and data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        byte_rate: int | None = None
        data_size: int | None = None
        pos = 12
        while pos + 8 <= len(data):
            chunk_id = data[pos : pos + 4]
            chunk_size = int.from_bytes(data[pos + 4 : pos + 8], "little")
            payload_pos = pos + 8
            if chunk_id == b"fmt " and chunk_size >= 16 and payload_pos + 16 <= len(data):
                byte_rate = int.from_bytes(data[payload_pos + 8 : payload_pos + 12], "little")
            elif chunk_id == b"data":
                data_size = chunk_size
            next_pos = payload_pos + chunk_size + (chunk_size & 1)
            if next_pos <= pos:
                break
            pos = next_pos
        if byte_rate and byte_rate > 0 and data_size is not None:
            return round(data_size / byte_rate, 3)

    if len(data) >= 32 and data[4:8] == b"ftyp":
        mvhd = data.find(b"mvhd", 0, min(len(data), 131_072))
        if mvhd != -1 and mvhd + 24 <= len(data):
            version = data[mvhd + 4]
            if version == 0:
                timescale_raw, duration_raw = struct.unpack(">II", data[mvhd + 16 : mvhd + 24])
                timescale = int(timescale_raw)
                duration = int(duration_raw)
                if timescale > 0:
                    return round(duration / timescale, 3)
            elif version == 1 and mvhd + 36 <= len(data):
                timescale_raw, duration_raw = struct.unpack(">IQ", data[mvhd + 24 : mvhd + 36])
                timescale = int(timescale_raw)
                duration = int(duration_raw)
                if timescale > 0:
                    return round(duration / timescale, 3)

    if len(data) >= 36 and data.startswith(b"OggS") and b"OpusHead" in data[:128]:
        last_page = data.rfind(b"OggS")
        if last_page != -1 and last_page + 14 <= len(data):
            granule = int.from_bytes(data[last_page + 6 : last_page + 14], "little", signed=False)
            if granule > 0:
                return round(granule / 48_000.0, 3)

    return None


def inspect_audio_bytes(data: bytes, mime_type: str) -> AudioInspection:
    """Validate decoded audio bytes, hostile signatures, decoded size, and duration limit."""
    if not data:
        raise InvalidMediaError("Audio data is empty.")
    if len(data) > MAX_AUDIO_BYTES:
        raise InvalidMediaError("Audio exceeds maximum decoded size.")
    if _has_unsafe_audio_bytes(data):
        raise InvalidMediaError("Audio payload contains unsupported or unsafe content.")

    duration_s = estimate_audio_duration_seconds(data)
    if duration_s is not None and duration_s > MAX_AUDIO_DURATION_SECONDS:
        raise InvalidMediaError("Audio duration exceeds the maximum allowed limit.")

    return AudioInspection(
        mime_type=normalize_audio_mime(mime_type),
        byte_length=len(data),
        duration_seconds=duration_s,
    )


def decode_audio_base64(base64_text: str) -> bytes:
    """Accepts raw base64 or a `data:<mime>;base64,<payload>` URL, like the former Node client.

    Raises `InvalidMediaError` (Gemini never called) for undecodable, empty, unsafe, oversized,
    or excessively long audio so corrupted or abusive uploads do not bill Gemini.
    """
    payload = base64_text.split(",", 1)[1] if "," in base64_text else base64_text
    try:
        data = base64.b64decode(payload, validate=False)
    except (binascii.Error, ValueError):
        raise InvalidMediaError("Audio data is not valid base64.") from None
    if not data:
        raise InvalidMediaError("Audio data is empty.")
    if len(data) > MAX_AUDIO_BYTES:
        raise InvalidMediaError("Audio exceeds maximum decoded size.")
    if _has_unsafe_audio_bytes(data):
        raise InvalidMediaError("Audio payload contains unsupported or unsafe content.")
    duration_s = estimate_audio_duration_seconds(data)
    if duration_s is not None and duration_s > MAX_AUDIO_DURATION_SECONDS:
        raise InvalidMediaError("Audio duration exceeds the maximum allowed limit.")
    return data
