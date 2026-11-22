"""Unit tests for GeminiClient.embed_content."""

from types import SimpleNamespace
from typing import Any

import pytest

from onusfit_ai.shared.llm.gemini import GeminiClient


class FakeEmbedResponse:
    def __init__(self, count: int, dim: int = 768) -> None:
        self.embeddings = [SimpleNamespace(values=[0.123] * dim) for _ in range(count)]


class FakeSdkModels:
    def __init__(self) -> None:
        self.last_call: dict[str, Any] = {}

    async def embed_content(
        self,
        *,
        model: str,
        contents: list[str],
        config: Any,
    ) -> FakeEmbedResponse:
        self.last_call = {
            "model": model,
            "contents": contents,
            "config": config,
        }
        return FakeEmbedResponse(len(contents), getattr(config, "output_dimensionality", 768))


class FakeSdkClient:
    def __init__(self) -> None:
        self.models = FakeSdkModels()
        self.aio = SimpleNamespace(models=self.models)


@pytest.mark.asyncio
async def test_gemini_client_embed_content() -> None:
    fake_sdk = FakeSdkClient()
    client = GeminiClient(api_key="test-key", sdk_client=fake_sdk)

    results = await client.embed_content(
        ["Test passage 1", "Test passage 2"],
        model="gemini-embedding-001",
        output_dimensionality=768,
        task_type="RETRIEVAL_DOCUMENT",
        title="Sample Document",
    )

    assert len(results) == 2
    for r in results:
        assert len(r.values) == 768

    last_call = fake_sdk.models.last_call
    assert last_call["model"] == "gemini-embedding-001"
    assert last_call["contents"] == ["Test passage 1", "Test passage 2"]
    cfg = last_call["config"]
    assert cfg.task_type == "RETRIEVAL_DOCUMENT"
    assert cfg.output_dimensionality == 768
    assert cfg.title == "Sample Document"


@pytest.mark.asyncio
async def test_gemini_client_embed_empty_contents() -> None:
    fake_sdk = FakeSdkClient()
    client = GeminiClient(api_key="test-key", sdk_client=fake_sdk)
    results = await client.embed_content([])
    assert results == []
