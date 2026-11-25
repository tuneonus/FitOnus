"""Cleaning of free text that is put into a prompt or comes back from a model."""

import re

# C0/C1 control characters (newlines and tabs included) and the Unicode line and paragraph
# separators.
_CONTROL = re.compile(r"[\x00-\x1f\x7f-\x9f\u2028\u2029]")
# Zero-width, byte-order mark, and bidirectional override codepoints used in hidden prompt attacks.
_INVISIBLE = re.compile(r"[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]")
_ROLE_PREFIXES = re.compile(r"\b(SYSTEM|DEVELOPER|ASSISTANT|INSTRUCTION)\s*:", re.IGNORECASE)
_SECRET_PATTERNS = (
    (re.compile(r"\bAIza[0-9A-Za-z_-]{20,}\b"), "[REDACTED_KEY]"),
    (re.compile(r"\b(?:sk|pk)-[0-9A-Za-z_-]{16,}\b"), "[REDACTED_KEY]"),
    (re.compile(r"\bBearer\s+[A-Za-z0-9._-]{16,}\b", re.IGNORECASE), "Bearer [REDACTED]"),
    (
        re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b"),
        "[REDACTED_TOKEN]",
    ),
    (re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"), "[REDACTED_EMAIL]"),
)


def clean_text(value: str, max_length: int | None = None) -> str:
    """One line of plain text: control and hidden override characters removed, spaces collapsed.

    Letters, digits, punctuation, emoji and every script (Tamil included) are kept as they are.
    """
    no_invisible = _INVISIBLE.sub("", value)
    text = " ".join(_CONTROL.sub(" ", no_invisible).split())
    if max_length is not None:
        text = text[:max_length].rstrip()
    return text


def clean_prompt_text(value: str | None) -> str | None:
    """Text a member typed or said, made safe to place between double quotes in a prompt.

    A double quote would close the quoted block early and a newline would start a new
    "instruction" line, so quotes become single quotes and the text becomes one line.
    None stays None.
    """
    if value is None:
        return None
    return clean_text(value.replace('"', "'"))


def sanitize_multimodal_user_text(value: str | None, max_length: int = 500) -> str | None:
    """Sanitize untrusted user text for multimodal context blocks by breaking delimiter mimicry."""
    if value is None:
        return None
    cleaned = clean_prompt_text(value)
    if not cleaned:
        return None
    neutralized = cleaned.replace("<", "(").replace(">", ")").replace("`", "'")
    neutralized = _ROLE_PREFIXES.sub(lambda m: f"[{m.group(1).lower()}]", neutralized)
    return clean_text(neutralized, max_length=max_length)


def redact_sensitive_text(text: str) -> str:
    """Redact accidental API keys, tokens, or emails from model outputs or user-visible logs."""
    result = text
    for pattern, replacement in _SECRET_PATTERNS:
        result = pattern.sub(replacement, result)
    return result
