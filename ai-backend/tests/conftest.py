"""Shared test helpers: signed service tokens, a fake LLM, and an app wired with the fake."""

import io
import json
import logging
import time
import uuid
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import jwt
import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel

from onusfit_ai.main import create_app
from onusfit_ai.shared.auth import replay_cache
from onusfit_ai.shared.llm.dependencies import get_embeddings_generator, get_llm
from onusfit_ai.shared.llm.ports import EmbeddingResult, LlmResult, LlmUsage, MediaInput
from onusfit_ai.shared.logging import configure_logging

SECRET = "test-secret-test-secret-test-secret-123"
FIXTURES = Path(__file__).parent / "fixtures" / "coach_chat"
VOICE_FIXTURES = Path(__file__).parent / "fixtures" / "voice_meal"
TRANSCRIBE_FIXTURES = Path(__file__).parent / "fixtures" / "transcribe"
MEAL_PHOTO_FIXTURES = Path(__file__).parent / "fixtures" / "meal_photo"
INSIGHTS_FIXTURES = Path(__file__).parent / "fixtures" / "coach_insights"


def load_request(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES / f"{name}.request.json").read_text(encoding="utf-8"))


def make_token(
    *,
    secret: str = SECRET,
    scope: str = "ai:coach:chat",
    sub: str = "11111111-1111-1111-1111-111111111111",
    issuer: str = "onusfit-node-api",
    audience: str = "onusfit-ai-backend",
    lifetime: int = 30,
    issued_at: float | None = None,
    jti: str | None = None,
    algorithm: str = "HS256",
) -> str:
    iat = int(issued_at if issued_at is not None else time.time())
    claims = {
        "iss": issuer,
        "aud": audience,
        "sub": sub,
        "iat": iat,
        "exp": iat + lifetime,
        "jti": jti or str(uuid.uuid4()),
        "scope": scope,
        "rid": "req-test-1",
    }
    return jwt.encode(claims, secret, algorithm=algorithm)


class FakeLlm:
    """Records the prompt it receives and returns a canned reply (or raises)."""

    def __init__(
        self,
        text: str = '{"text":"Hello!","followUps":["Next?"],"sources":["Profile"],"medicalNote":false}',
        error: Exception | None = None,
        parsed: Any | None = None,
        finish_reason: str | None = None,
        tool_calls: list[Any] | None = None,
    ) -> None:
        self.text = text
        self.error = error
        self.parsed = parsed
        self.finish_reason = finish_reason
        self.tool_calls = tool_calls or []
        self.calls: list[dict[str, Any]] = []

    async def generate_text(
        self,
        prompt: str,
        *,
        primary_model: str,
        fallback_model: str | None,
        deadline_s: float,
        media: MediaInput | None = None,
        schema: type[BaseModel] | None = None,
        tools: list[Any] | None = None,
        tool_handler: Any | None = None,
        max_tool_rounds: int = 3,
        max_total_tool_calls: int = 5,
        max_total_tokens: int | None = None,
        **kwargs: Any,
    ) -> LlmResult:
        self.calls.append(
            {
                "prompt": prompt,
                "primary": primary_model,
                "fallback": fallback_model,
                "deadline_s": deadline_s,
                "media": media,
                "schema": schema,
                "tools": tools,
                "tool_handler": tool_handler,
                "max_tool_rounds": max_tool_rounds,
                "max_total_tool_calls": max_total_tool_calls,
                "max_total_tokens": max_total_tokens,
                **kwargs,
            }
        )
        if self.error:
            raise self.error

        parsed_val = self.parsed
        if parsed_val is None and schema is not None and self.text:
            try:
                data = json.loads(self.text)
                if isinstance(data, dict):
                    parsed_val = schema.model_validate(data)
            except Exception:
                parsed_val = None

        return LlmResult(
            text=self.text,
            parsed=parsed_val,
            finish_reason=self.finish_reason,
            tool_calls=self.tool_calls,
            usage=LlmUsage(
                model=primary_model,
                is_fallback=False,
                input_tokens=100,
                output_tokens=20,
                cached_tokens=0,
                thinking_tokens=5,
                total_tokens=125,
                duration_ms=321,
            ),
        )

    async def embed_content(
        self,
        contents: list[str],
        *,
        model: str = "gemini-embedding-001",
        output_dimensionality: int = 768,
        task_type: str = "RETRIEVAL_DOCUMENT",
        title: str | None = None,
    ) -> list[EmbeddingResult]:
        self.calls.append(
            {
                "embed_contents": contents,
                "model": model,
                "output_dimensionality": output_dimensionality,
                "task_type": task_type,
                "title": title,
            }
        )
        if self.error:
            raise self.error
        return [
            EmbeddingResult(values=[0.05 * (i % 10 + 1)] * output_dimensionality)
            for i, _ in enumerate(contents)
        ]


@pytest.fixture(autouse=True)
def _env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("AI_SERVICE_JWT_SECRET", SECRET)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    replay_cache.clear()
    yield
    replay_cache.clear()


@pytest.fixture
def fake_llm() -> FakeLlm:
    return FakeLlm()


@pytest.fixture
def client(fake_llm: FakeLlm) -> TestClient:
    app = create_app()
    app.dependency_overrides[get_llm] = lambda: fake_llm
    app.dependency_overrides[get_embeddings_generator] = lambda: fake_llm
    return TestClient(app)


@pytest.fixture(autouse=True)
def _remove_stdout_log_handler() -> Iterator[None]:
    """`configure_logging` installs a handler bound to whatever stdout was at the time; drop it per test."""
    yield
    logger = logging.getLogger("onusfit_ai")
    for handler in [h for h in logger.handlers if getattr(h, "_onusfit_stdout", False)]:
        logger.removeHandler(handler)


class JsonLogs:
    """The JSON lines the service writes, parsed. The handler writes into an in-memory buffer owned by
    this object, so it works in any pytest phase (a handler bound to `sys.stdout` would be bound to
    pytest's per-phase capture, which is swapped between fixture setup and the test body)."""

    def __init__(self) -> None:
        self.buffer = io.StringIO()

    @property
    def text(self) -> str:
        return self.buffer.getvalue()

    def clear(self) -> None:
        self.buffer.seek(0)
        self.buffer.truncate()

    def entries(self) -> list[dict[str, Any]]:
        return [json.loads(line) for line in self.text.splitlines() if line.strip()]

    def events(self, name: str) -> list[dict[str, Any]]:
        return [e for e in self.entries() if e.get("event") == name]


@pytest.fixture
def json_logs() -> JsonLogs:
    configure_logging("INFO", "json")
    logs = JsonLogs()
    for handler in logging.getLogger("onusfit_ai").handlers:
        if getattr(handler, "_onusfit_stdout", False) and isinstance(
            handler, logging.StreamHandler
        ):
            handler.setStream(logs.buffer)
    return logs
