import time

import pytest
from fastapi.testclient import TestClient

from conftest import SECRET, load_request, make_token

URL = "/internal/v1/ai/coach/chat"


def post(client: TestClient, token: str | None):  # type: ignore[no-untyped-def]
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return client.post(URL, json=load_request("sparse"), headers=headers)


def test_valid_token_is_accepted(client: TestClient) -> None:
    assert post(client, make_token()).status_code == 200


def test_missing_token_is_rejected(client: TestClient) -> None:
    response = post(client, None)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTH_INVALID_TOKEN"


@pytest.mark.parametrize(
    "bad_token",
    [
        pytest.param(lambda: make_token(secret="x" * 40), id="wrong-secret"),
        pytest.param(lambda: make_token(audience="someone-else"), id="wrong-audience"),
        pytest.param(lambda: make_token(issuer="evil"), id="wrong-issuer"),
        pytest.param(lambda: make_token(scope="ai:other"), id="wrong-scope"),
        pytest.param(lambda: make_token(issued_at=time.time() - 3600), id="expired"),
        pytest.param(lambda: make_token(lifetime=3600), id="lifetime-too-long"),
        pytest.param(lambda: "not.a.jwt", id="garbage"),
    ],
)
def test_bad_tokens_are_rejected_without_detail(client: TestClient, bad_token) -> None:  # type: ignore[no-untyped-def]
    response = post(client, bad_token())
    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Invalid service token."


def test_token_replay_is_rejected(client: TestClient) -> None:
    token = make_token(jti="same-jti")
    assert post(client, token).status_code == 200
    assert post(client, token).status_code == 401


def test_unsigned_none_algorithm_is_rejected(client: TestClient) -> None:
    import base64
    import json

    def b64(data: dict[str, object]) -> str:
        return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()

    now = int(time.time())
    token = (
        b64({"alg": "none", "typ": "JWT"})
        + "."
        + b64(
            {
                "iss": "onusfit-node-api",
                "aud": "onusfit-ai-backend",
                "sub": "u",
                "iat": now,
                "exp": now + 30,
                "jti": "n1",
                "scope": "ai:coach:chat",
            }
        )
        + "."
    )
    assert post(client, token).status_code == 401


def test_service_without_secret_fails_closed(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("AI_SERVICE_JWT_SECRET")
    response = post(client, make_token())
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "AUTH_NOT_CONFIGURED"


def test_short_secret_fails_closed(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_SERVICE_JWT_SECRET", "short")
    assert post(client, make_token(secret="short")).status_code == 503


def test_secret_constant_is_long_enough() -> None:
    assert len(SECRET) >= 32
