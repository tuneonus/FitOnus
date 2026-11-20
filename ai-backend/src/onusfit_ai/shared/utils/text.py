"""Cleaning of free text that is put into a prompt or comes back from a model."""

import re

# C0/C1 control characters (newlines and tabs included) and the Unicode line and paragraph
# separators.
_CONTROL = re.compile(r"[\x00-\x1f\x7f-\x9f  ]")


def clean_text(value: str, max_length: int | None = None) -> str:
    """One line of plain text: control characters become spaces, whitespace runs collapse.

    Letters, digits, punctuation, emoji and every script (Tamil included) are kept as they are.
    """
    text = " ".join(_CONTROL.sub(" ", value).split())
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
