"""Image rules for the meal photo endpoint.

Mirror of what the Node API applies (`analyzeMealPhotoRequest` and `AnalyzeMealPhotoUseCase`): the
same four MIME types and a 10 MB cap measured on the base64 text. Python re-checks them because this
service never trusts its caller to have validated, and additionally checks that the bytes really are
an image, so a corrupt upload is refused before Gemini is called (and billed).
"""

import base64
import binascii

from onusfit_ai.shared.utils.media import InvalidMediaError

SUPPORTED_IMAGE_MIME_TYPES = ("image/jpeg", "image/png", "image/webp", "image/heic")
MAX_IMAGE_BASE64_CHARS = 10 * 1024 * 1024


def looks_like_supported_image(data: bytes) -> bool:
    """True if the first bytes are the signature of a JPEG, PNG, WebP or HEIC/HEIF file.

    Only the signature is checked, not the declared MIME type: the app has always sent
    `image/jpeg` by default, and Gemini accepts a mismatching label, so rejecting a real photo
    because of its label would be a regression.
    """
    return (
        data.startswith(b"\xff\xd8\xff")  # JPEG
        or data.startswith(b"\x89PNG\r\n\x1a\n")  # PNG
        or (data[:4] == b"RIFF" and data[8:12] == b"WEBP")  # WebP
        or data[4:8] == b"ftyp"  # HEIC / HEIF (ISO base media file)
    )


def decode_image_base64(base64_text: str) -> bytes:
    """Accepts raw base64 or a `data:<mime>;base64,<payload>` URL, like the former Node client.

    Raises `InvalidMediaError` (Gemini never called) for undecodable or non-image data. The message
    never echoes the input.
    """
    payload = base64_text.split(",", 1)[1] if "," in base64_text else base64_text
    try:
        data = base64.b64decode(payload, validate=False)
    except (binascii.Error, ValueError):
        data = b""
    if not looks_like_supported_image(data):
        raise InvalidMediaError("Image data is not a valid JPEG, PNG, WebP or HEIC image.")
    return data
