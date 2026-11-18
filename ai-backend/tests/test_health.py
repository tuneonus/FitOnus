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
