"""Audio rules shared by every endpoint that accepts an audio clip.

Mirror of the rules the Node API applies (ParseVoiceMealUseCase): the same allow-list, the same
lenient "contains" match (so `audio/x-m4a` and `audio/mp4; codecs=mp4a` pass), and a 15 MB cap
measured on the base64 text. Python re-checks them even though Node already did: this service
never trusts its caller to have validated.
"""

import base64
import binascii

from onusfit_ai.shared.utils.media import InvalidMediaError

# `audio/m4a` -> "m4a": a MIME type is accepted if it contains any of these.
SUPPORTED_AUDIO_FORMATS = ("m4a", "mp4", "aac", "wav", "webm", "ogg", "mpeg", "3gpp")
MAX_AUDIO_BASE64_CHARS = 15 * 1024 * 1024


def is_supported_audio_mime(mime_type: str) -> bool:
    return any(fmt in mime_type for fmt in SUPPORTED_AUDIO_FORMATS)


def decode_audio_base64(base64_text: str) -> bytes:
    """Accepts raw base64 or a `data:<mime>;base64,<payload>` URL, like the former Node client.

    Raises `InvalidMediaError` (Gemini never called) for undecodable or empty audio. Unlike images
    there is no single file signature to check (m4a, wav, webm, ogg... differ), so only "is there
    any audio at all" is verified: `b64decode(validate=False)` turns "!!!!" into 0 bytes.
    """
    payload = base64_text.split(",", 1)[1] if "," in base64_text else base64_text
    try:
        data = base64.b64decode(payload, validate=False)
    except (binascii.Error, ValueError):
        raise InvalidMediaError("Audio data is not valid base64.") from None
    if not data:
        raise InvalidMediaError("Audio data is empty.")
    return data
