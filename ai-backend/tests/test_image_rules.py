"""Image rules: signature checks and base64 decoding (no HTTP)."""

import base64

import pytest

from onusfit_ai.shared.utils.image import decode_image_base64, looks_like_supported_image
from onusfit_ai.shared.utils.media import InvalidMediaError

JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF"
PNG = b"\x89PNG\r\n\x1a\n\x00\x00"
WEBP = b"RIFF\x24\x00\x00\x00WEBPVP8 "
HEIC = b"\x00\x00\x00\x18ftypheic\x00\x00"


@pytest.mark.parametrize("data", [JPEG, PNG, WEBP, HEIC])
def test_supported_signatures(data: bytes) -> None:
    assert looks_like_supported_image(data)


@pytest.mark.parametrize(
    "data",
    [b"", b"GIF89a....", b"BM\x00\x00", b"%PDF-1.7", b"hello world", b"RIFF\x00\x00\x00\x00WAVE"],
)
def test_other_content_is_not_a_supported_image(data: bytes) -> None:
    assert not looks_like_supported_image(data)


def test_raw_and_data_url_base64_decode_to_the_same_bytes() -> None:
    raw = base64.b64encode(JPEG).decode()
    assert decode_image_base64(raw) == JPEG
    assert decode_image_base64("data:image/jpeg;base64," + raw) == JPEG


@pytest.mark.parametrize("text", ["!!!!", "a,b", "aGVsbG8=", "====", "A"])
def test_undecodable_or_non_image_data_is_rejected_before_gemini(text: str) -> None:
    # The helper knows nothing about HTTP; tests/test_media_rules.py checks the 422 it becomes.
    with pytest.raises(InvalidMediaError) as caught:
        decode_image_base64(text)
    assert text not in str(caught.value)
