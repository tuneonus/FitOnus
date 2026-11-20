"""The one error the audio and image helpers raise.

It knows nothing about HTTP: the use cases just let it propagate, and `shared/errors` turns it into
the same `422 INVALID_REQUEST` (Gemini never called, `dispatched=false`) the helpers used to raise
themselves. That keeps the domain and application layers free of FastAPI.
"""


class InvalidMediaError(ValueError):
    """Audio or image data is not usable. The message never echoes the input."""
