"""Shared test helpers: signed service tokens, a fake LLM, and an app wired with the fake."""

import json
import time
import uuid
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import jwt
import pytest
from fastapi.testclient import TestClient

from onusfit_ai.core.auth import replay_cache
from onusfit_ai.llm.gemini import LlmResult, LlmUsage, MediaInput, get_llm
from onusfit_ai.main import create_app

SECRET = "test-secret-test-secret-test-secret-123"
FIXTURES = Path(__file__).parent / "fixtures" / "coach_chat"
VOICE_FIXTURES = Path(__file__).parent / "fixtures" / "voice_meal"
TRANSCRIBE_FIXTURES = Path(__file__).parent / "fixtures" / "transcribe"


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
    ) -> None:
        self.text = text
        self.error = error
        self.calls: list[dict[str, Any]] = []

    async def generate_text(
        self,
        prompt: str,
        *,
        primary_model: str,
        fallback_model: str | None,
        deadline_s: float,
        media: MediaInput | None = None,
    ) -> LlmResult:
        self.calls.append(
            {
                "prompt": prompt,
                "primary": primary_model,
                "fallback": fallback_model,
                "deadline_s": deadline_s,
                "media": media,
            }
        )
        if self.error:
            raise self.error
        return LlmResult(
            text=self.text,
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
    return TestClient(app)
