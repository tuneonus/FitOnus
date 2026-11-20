from fastapi.testclient import TestClient

from onusfit_ai.main import create_app


def test_live_returns_ok() -> None:
    client = TestClient(create_app())

    response = client.get("/health/live")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "onusfit-ai-backend"


def test_live_reports_environment_from_env(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setenv("ONUSFIT_AI_ENV", "test")

    response = TestClient(create_app()).get("/health/live")

    assert response.json()["environment"] == "test"


def test_health_needs_no_configuration_no_token_and_never_calls_gemini(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    from onusfit_ai.shared.llm.dependencies import get_llm

    for name in ("AI_SERVICE_JWT_SECRET", "GEMINI_API_KEY", "ONUSFIT_AI_ENV"):
        monkeypatch.delenv(name, raising=False)

    def forbidden() -> None:
        raise AssertionError("the health check must never touch the AI provider")

    app = create_app()
    app.dependency_overrides[get_llm] = forbidden  # would blow up if health depended on Gemini
    response = TestClient(app).get("/health/live")  # no Authorization header

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "onusfit-ai-backend",
        "version": response.json()["version"],
        "environment": "development",
    }


def test_the_public_docs_pages_do_not_exist() -> None:
    client = TestClient(create_app())
    assert [client.get(p).status_code for p in ("/docs", "/redoc", "/openapi.json")] == [404] * 3
