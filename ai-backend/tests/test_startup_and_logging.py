"""Deployment safety: production refuses a bad configuration, and logs never carry secrets."""

import logging
import sys
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from conftest import SECRET
from onusfit_ai.core.config import configuration_problems
from onusfit_ai.core.logging import configure_logging, redact
from onusfit_ai.main import create_app

# Built at runtime so the repository never contains a literal that looks like a real key to secret scanners.
KEY_VALUE = "AI" + "za" + "SyFAKE-FAKE-FAKE-FAKE-FAKE-FAKE-1234"


@pytest.fixture
def production(monkeypatch: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    monkeypatch.setenv("ONUSFIT_AI_ENV", "production")
    monkeypatch.setenv("GEMINI_API_KEY", KEY_VALUE)
    return monkeypatch


@pytest.fixture(autouse=True)
def _clean_logging() -> Iterator[None]:
    def reset() -> None:
        logger = logging.getLogger("onusfit_ai")
        for handler in [h for h in logger.handlers if getattr(h, "_onusfit_stdout", False)]:
            logger.removeHandler(handler)

    reset()
    yield
    reset()


def start(**_: Any) -> None:
    with TestClient(create_app()):  # entering the client runs the lifespan (startup checks)
        pass


def test_production_starts_with_a_complete_configuration(production: pytest.MonkeyPatch) -> None:
    with TestClient(create_app()) as client:
        assert client.get("/health/live").json()["environment"] == "production"


def test_production_refuses_to_start_without_a_gemini_key(production: pytest.MonkeyPatch) -> None:
    production.delenv("GEMINI_API_KEY")
    with pytest.raises(RuntimeError, match="GEMINI_API_KEY"):
        start()


def test_production_refuses_to_start_without_a_service_secret(
    production: pytest.MonkeyPatch,
) -> None:
    production.delenv("AI_SERVICE_JWT_SECRET")
    with pytest.raises(RuntimeError, match="AI_SERVICE_JWT_SECRET"):
        start()


def test_a_short_secret_is_refused_and_never_echoed(production: pytest.MonkeyPatch) -> None:
    production.setenv("AI_SERVICE_JWT_SECRET", "short-secret-VALUE")
    with pytest.raises(RuntimeError, match="at least 32") as caught:
        start()
    assert "short-secret-VALUE" not in str(caught.value) and KEY_VALUE not in str(caught.value)


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("GEMINI_ATTEMPT_TIMEOUT_S", "abc"),
        ("GEMINI_ATTEMPT_TIMEOUT_S", "0"),
        ("GEMINI_ATTEMPT_TIMEOUT_S", "61"),
        ("AI_SERVICE_JWT_ISSUER", "  "),
        ("AI_SERVICE_JWT_AUDIENCE", " "),
        ("LOG_LEVEL", "LOUD"),
        ("LOG_FORMAT", "xml"),
    ],
)
def test_production_refuses_other_bad_settings(
    production: pytest.MonkeyPatch, name: str, value: str
) -> None:
    production.setenv(name, value)
    with pytest.raises(RuntimeError, match=name):
        start()


def test_an_unparsable_number_is_fatal_even_outside_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_ATTEMPT_TIMEOUT_S", "abc")
    with pytest.raises(RuntimeError, match="GEMINI_ATTEMPT_TIMEOUT_S"):
        start()


def test_development_starts_without_a_key_but_says_what_will_not_work(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("ONUSFIT_AI_ENV", "development")
    with caplog.at_level("INFO", logger="onusfit_ai"):
        start()
    logged = "\n".join(r.getMessage() for r in caplog.records)
    assert "GEMINI_API_KEY is not set" in logged and "starting onusfit-ai-backend" in logged


def test_the_startup_line_reports_presence_only_never_values(
    production: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level("INFO", logger="onusfit_ai"):
        start()
    starting = next(r for r in caplog.records if getattr(r, "event", "") == "service.starting")
    assert starting.fields["geminiKeyConfigured"] is True  # type: ignore[attr-defined]
    assert starting.fields["serviceSecretConfigured"] is True  # type: ignore[attr-defined]
    logged = "\n".join(f"{r.getMessage()} {getattr(r, 'fields', '')}" for r in caplog.records)
    assert KEY_VALUE not in logged and SECRET not in logged


def test_problems_are_listed_without_values(production: pytest.MonkeyPatch) -> None:
    production.setenv("AI_SERVICE_JWT_SECRET", "tiny")
    production.delenv("GEMINI_API_KEY")
    problems = configuration_problems()
    assert len(problems) == 2 and "tiny" not in " ".join(problems)


def test_redaction_masks_keys_bearer_tokens_and_jwts() -> None:
    jwt_like = ".".join(
        ["ey" + "JhbGciOiJIUzI1NiJ9", "ey" + "JzdWIiOiIxMjM0NTY3ODkwIn0", "abcdefghijklmnop"]
    )
    text = f"key={KEY_VALUE} header=Bearer abc.DEF-123_x token={jwt_like} ok=model-name"
    out = redact(text)
    assert KEY_VALUE not in out and "abc.DEF-123_x" not in out and jwt_like not in out
    assert "ok=model-name" in out


def test_configure_logging_is_idempotent_and_writes_redacted_lines_to_stdout(
    capsys: pytest.CaptureFixture[str],
) -> None:
    configure_logging("INFO", "text")
    configure_logging("INFO", "text")
    logger = logging.getLogger("onusfit_ai")
    assert sum(getattr(h, "_onusfit_stdout", False) for h in logger.handlers) == 1

    logging.getLogger("onusfit_ai.test").info("coach_chat outcome=ok leaked=%s", KEY_VALUE)
    output = capsys.readouterr().out
    assert "coach_chat outcome=ok" in output and KEY_VALUE not in output
    assert "[redacted-api-key]" in output and " INFO onusfit_ai.test " in output


def test_exception_text_is_redacted_too(capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging("INFO")
    try:
        raise ValueError(f"upstream said {KEY_VALUE}")
    except ValueError:
        logging.getLogger("onusfit_ai.test").exception("call failed")
    assert KEY_VALUE not in capsys.readouterr().out


def test_noisy_http_libraries_are_quieted() -> None:
    configure_logging("DEBUG")
    for name in ("httpx", "httpcore", "google_genai", "google.genai"):
        assert logging.getLogger(name).level == logging.WARNING
    assert sys.stdout is not None
