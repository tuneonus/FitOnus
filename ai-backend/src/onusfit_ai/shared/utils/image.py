"""Image rules for meal photos: format signatures, pixel bombs, polyglots, and privacy scrubbing.

Mirror of what the Node API applies (`analyzeMealPhotoRequest` and `AnalyzeMealPhotoUseCase`): the
same four MIME types and a 10 MB cap measured on the base64 text. Python re-checks them because this
service never trusts its caller to have validated, enforces dimension/polyglot limits before sending
to Gemini, and strips JPEG EXIF/XMP/comment metadata so GPS coordinates and embedded comments never
reach the model.
"""

import base64
import binascii
import struct
from dataclasses import dataclass

from onusfit_ai.shared.utils.media import InvalidMediaError

SUPPORTED_IMAGE_MIME_TYPES = ("image/jpeg", "image/png", "image/webp", "image/heic")
# ~7.5 MiB binary; enough for compressed meal photography without blowing memory.
MAX_IMAGE_BASE64_CHARS = 10 * 1024 * 1024
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_IMAGE_DIMENSION_PX = 8192
MAX_IMAGE_PIXELS = 40_000_000

_HEIC_BRANDS = frozenset((b"heic", b"heix", b"hevc", b"hevx", b"mif1", b"msf1"))
_DANGEROUS_HEAD_PREFIXES = (
    b"%pdf-",
    b"\x7felf",
    b"pk\x03\x04",
    b"mz\x90",
    b"<svg",
    b"<html",
    b"<!doctype",
    b"<script",
    b"<?xml",
    b"#!/",
)
_POLYGLOT_MARKERS = (b"<script", b"<svg", b"<?php", b"<!doctype html", b"<html")
_JPEG_SOF_MARKERS = frozenset(
    (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF)
)


@dataclass(frozen=True)
class ImageInspection:
    """Validated metadata extracted from raw image bytes without storing the image."""

    mime_type: str
    byte_length: int
    width: int | None
    height: int | None
    has_exif_metadata: bool


def normalize_image_mime(mime_type: str) -> str:
    """Normalize common image MIME aliases while preserving exact format identifiers."""
    normalized = mime_type.split(";", 1)[0].strip().lower()
    if normalized == "image/jpg":
        return "image/jpeg"
    if normalized == "image/heif":
        return "image/heic"
    return normalized


def _contains_polyglot_payload(data: bytes) -> bool:
    """Reject active script/document polyglots hidden in headers or appended trailers."""
    stripped_head = data[:512].lstrip().lower()
    if any(stripped_head.startswith(prefix) for prefix in _DANGEROUS_HEAD_PREFIXES):
        return True
    if any(marker in stripped_head for marker in _POLYGLOT_MARKERS):
        return True

    tail = data[-1024:].lower()
    if any(marker in tail for marker in _POLYGLOT_MARKERS):
        return True

    eoi = data.rfind(b"\xff\xd9")
    if eoi != -1 and eoi + 2 < len(data):
        trailer = data[eoi + 2 : eoi + 514]
        if b"PK\x03\x04" in trailer or b"%PDF-" in trailer:
            return True
    iend = data.rfind(b"IEND\xaeB`\x82")
    if iend != -1 and iend + 8 < len(data):
        trailer = data[iend + 8 : iend + 520]
        if b"PK\x03\x04" in trailer or b"%PDF-" in trailer:
            return True
    return False


def detect_image_mime_from_bytes(data: bytes) -> str | None:
    """Identify JPEG, PNG, WebP, or HEIC from magic bytes and reject polyglot disguises."""
    if len(data) < 4 or _contains_polyglot_payload(data):
        return None
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if len(data) >= 12 and data[4:8] == b"ftyp" and data[8:12] in _HEIC_BRANDS:
        return "image/heic"
    return None


def looks_like_supported_image(data: bytes) -> bool:
    """True if the first bytes match JPEG, PNG, WebP or HEIC/HEIF without dangerous polyglots.

    Only the signature is checked when ``claimed_mime_type`` is not enforced, because mobile
    historically defaulted to ``image/jpeg``. When ``inspect_image_bytes`` receives an explicit
    ``claimed_mime_type``, strict MIME consistency is enforced as well.
    """
    return detect_image_mime_from_bytes(data) is not None


def _inspect_jpeg(data: bytes) -> tuple[tuple[int, int] | None, bool]:
    """Scan JPEG header markers for SOF dimensions and EXIF/XMP metadata presence."""
    dimensions: tuple[int, int] | None = None
    has_exif = False
    pos = 2
    limit = min(len(data), 131_072)
    while pos < limit:
        if data[pos] != 0xFF:
            break
        while pos < limit and data[pos] == 0xFF:
            pos += 1
        if pos >= limit:
            break
        marker = data[pos]
        pos += 1
        if marker in (0xD8, 0xD9, 0x00) or 0xD0 <= marker <= 0xD7:
            continue
        if marker == 0xDA:
            break
        if pos + 2 > len(data):
            break
        seg_len = int.from_bytes(data[pos : pos + 2], "big")
        if seg_len < 2 or pos + seg_len > len(data):
            break
        payload = data[pos + 2 : pos + seg_len]
        if marker == 0xE1 and (
            payload.startswith(b"Exif\x00\x00") or payload.startswith(b"http://ns.adobe.com/xap")
        ):
            has_exif = True
        if dimensions is None and marker in _JPEG_SOF_MARKERS and len(payload) >= 5:
            height, width = struct.unpack(">HH", payload[1:5])
            dimensions = (width, height)
        pos += seg_len
    return dimensions, has_exif


def extract_image_dimensions(data: bytes) -> tuple[int, int] | None:
    """Extract ``(width, height)`` when full container headers exist; ``None`` for tiny stubs."""
    mime = detect_image_mime_from_bytes(data)
    if mime == "image/png" and len(data) >= 24 and data[12:16] == b"IHDR":
        width, height = struct.unpack(">II", data[16:24])
        return (width, height)
    if mime == "image/jpeg":
        dims, _ = _inspect_jpeg(data)
        return dims
    if mime == "image/webp" and len(data) >= 30:
        chunk = data[12:16]
        if chunk == b"VP8X":
            width = int.from_bytes(data[24:27], "little") + 1
            height = int.from_bytes(data[27:30], "little") + 1
            return (width, height)
        if chunk == b"VP8L" and data[20] == 0x2F:
            bits = int.from_bytes(data[21:25], "little")
            width = (bits & 0x3FFF) + 1
            height = ((bits >> 14) & 0x3FFF) + 1
            return (width, height)
        if chunk == b"VP8 " and data[23:26] == b"\x9d\x01\x2a":
            width = int.from_bytes(data[26:28], "little") & 0x3FFF
            height = int.from_bytes(data[28:30], "little") & 0x3FFF
            return (width, height)
    return None


def inspect_image_bytes(data: bytes, claimed_mime_type: str | None = None) -> ImageInspection:
    """Validate decoded image signature, dimensions, size cap, and optional MIME match."""
    detected_mime = detect_image_mime_from_bytes(data)
    if detected_mime is None:
        raise InvalidMediaError("Image data is not a valid JPEG, PNG, WebP or HEIC image.")
    if len(data) > MAX_IMAGE_BYTES:
        raise InvalidMediaError("Image exceeds maximum decoded size.")
    if claimed_mime_type is not None:
        normalized_claim = normalize_image_mime(claimed_mime_type)
        if normalized_claim not in SUPPORTED_IMAGE_MIME_TYPES:
            raise InvalidMediaError("Unsupported image MIME type.")
        if normalized_claim != detected_mime:
            raise InvalidMediaError("Image MIME type does not match actual file content.")

    dims = extract_image_dimensions(data)
    if dims is not None:
        width, height = dims
        if (
            width <= 0
            or height <= 0
            or width > MAX_IMAGE_DIMENSION_PX
            or height > MAX_IMAGE_DIMENSION_PX
            or (width * height) > MAX_IMAGE_PIXELS
        ):
            raise InvalidMediaError("Image dimensions exceed allowed limits.")
    else:
        width, height = None, None

    has_exif = False
    if detected_mime == "image/jpeg":
        _, has_exif = _inspect_jpeg(data)

    return ImageInspection(
        mime_type=detected_mime,
        byte_length=len(data),
        width=width,
        height=height,
        has_exif_metadata=has_exif,
    )


def strip_jpeg_exif_metadata(data: bytes) -> bytes:
    """Remove JPEG EXIF, XMP, and COM comment segments before transient forwarding to Gemini."""
    if not data.startswith(b"\xff\xd8\xff"):
        return data

    out = bytearray(data[:2])
    pos = 2
    stripped_any = False
    while pos < len(data):
        if data[pos] != 0xFF:
            return data
        marker_start = pos
        while pos < len(data) and data[pos] == 0xFF:
            pos += 1
        if pos >= len(data):
            return data
        marker = data[pos]
        pos += 1
        if marker in (0xD8, 0xD9, 0x00) or 0xD0 <= marker <= 0xD7:
            out.extend(data[marker_start:pos])
            if marker == 0xD9:
                out.extend(data[pos:])
                break
            continue
        if marker == 0xDA:
            out.extend(data[marker_start:])
            break
        if pos + 2 > len(data):
            return data
        seg_len = int.from_bytes(data[pos : pos + 2], "big")
        if seg_len < 2 or pos + seg_len > len(data):
            return data
        payload = data[pos + 2 : pos + seg_len]
        is_privacy_or_comment = marker == 0xFE or (
            marker == 0xE1
            and (
                payload.startswith(b"Exif\x00\x00")
                or payload.startswith(b"http://ns.adobe.com/xap")
            )
        )
        if is_privacy_or_comment:
            stripped_any = True
        else:
            out.extend(data[marker_start : pos + seg_len])
        pos += seg_len

    return bytes(out) if stripped_any else data


def decode_image_base64(base64_text: str, *, claimed_mime_type: str | None = None) -> bytes:
    """Accepts raw base64 or a ``data:<mime>;base64,<payload>`` URL and validates image bytes.

    Raises ``InvalidMediaError`` (Gemini never called) for undecodable, oversized, bomb, or
    non-image data. The message never echoes the input.
    """
    if "," in base64_text:
        header, payload = base64_text.split(",", 1)
        if header.lower().startswith("data:") and ";" in header:
            data_url_mime = normalize_image_mime(header[5:].split(";", 1)[0])
            if data_url_mime not in SUPPORTED_IMAGE_MIME_TYPES:
                raise InvalidMediaError("Image data is not a valid JPEG, PNG, WebP or HEIC image.")
    else:
        payload = base64_text

    try:
        data = base64.b64decode(payload, validate=False)
    except (binascii.Error, ValueError):
        data = b""

    inspect_image_bytes(data, claimed_mime_type=claimed_mime_type)
    return data
