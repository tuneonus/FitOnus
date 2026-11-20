"""Oversized request bodies are refused before auth and before FastAPI parses them (audit M6).

FastAPI reads and JSON-parses the whole body before it checks the token, so without this cap anyone who
can reach the service could make it buffer any amount of data. A small limit is patched in so the tests
stay fast; `test_the_default_limit_leaves_room_for_the_biggest_valid_request` pins the real number.
"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import PlainTextResponse
from starlette.routing import Route

from conftest import FakeLlm, JsonLogs, make_token
from onusfit_ai.main import create_app
from onusfit_ai.shared.llm.dependencies import get_llm
from onusfit_ai.shared.request_limits import MAX_REQUEST_BODY_BYTES, RequestBodyLimitMiddleware
from onusfit_ai.shared.utils.audio import MAX_AUDIO_BASE64_CHARS

URL = "/internal/v1/ai/coach/chat"
LIMIT = 2048
TOO_LARGE = {
    "error": {
        "code": "PAYLOAD_TOO_LARGE",
        "message": "Request body is too large.",
        "dispatched": False,
    }
}


@pytest.fixture
def small_limit_client(monkeypatch: pytest.MonkeyPatch, fake_llm: FakeLlm) -> TestClient:
    monkeypatch.setattr("onusfit_ai.main.MAX_REQUEST_BODY_BYTES", LIMIT)
    app = create_app()
    app.dependency_overrides[get_llm] = lambda: fake_llm
    return TestClient(app)


def test_the_default_limit_leaves_room_for_the_biggest_valid_request() -> None:
    # The largest legitimate body is a max-size voice clip (base64 text) plus a little JSON.
    assert MAX_REQUEST_BODY_BYTES > MAX_AUDIO_BASE64_CHARS + 64 * 1024


def test_a_declared_oversized_body_is_refused_before_auth(
    small_limit_client: TestClient, fake_llm: FakeLlm
) -> None:
    # No token at all: auth would answer 401, validation 422. The size check comes first.
    response = small_limit_client.post(URL, content=b"x" * (LIMIT + 1))

    assert response.status_code == 413
    assert response.json() == TOO_LARGE
    assert fake_llm.calls == []


def test_a_chunked_oversized_body_without_content_length_is_refused(
    small_limit_client: TestClient, fake_llm: FakeLlm
) -> None:
    def chunks() -> Iterator[bytes]:
        for _ in range(LIMIT // 512 + 2):  # streamed, so there is no Content-Length to check
            yield b"x" * 512

    response = small_limit_client.post(URL, content=chunks())

    assert response.status_code == 413
    assert response.json() == TOO_LARGE
    assert fake_llm.calls == []


def test_a_body_within_the_limit_still_reaches_auth(small_limit_client: TestClient) -> None:
    response = small_limit_client.post(URL, content=b"x" * (LIMIT - 1))
    assert response.status_code == 401  # got past the size check; no token, so auth refuses


def test_a_valid_authenticated_request_is_not_affected(
    monkeypatch: pytest.MonkeyPatch, fake_llm: FakeLlm
) -> None:
    from conftest import load_request  # the sparse fixture is well under 20 KB

    app = create_app()  # real default limit
    app.dependency_overrides[get_llm] = lambda: fake_llm
    response = TestClient(app).post(
        URL,
        json=load_request("sparse"),
        headers={"Authorization": f"Bearer {make_token(scope='ai:coach:chat')}"},
    )
    assert response.status_code == 200


def test_a_refusal_is_logged_with_the_right_category(
    small_limit_client: TestClient, json_logs: JsonLogs
) -> None:
    small_limit_client.post(
        URL, content=b"x" * (LIMIT + 1), headers={"X-Correlation-Id": "corr-1234567"}
    )

    failed = json_logs.events("ai.request.failed")
    assert len(failed) == 1
    assert (failed[0]["errorCode"], failed[0]["httpStatus"], failed[0]["dispatched"]) == (
        "PAYLOAD_TOO_LARGE",
        413,
        False,
    )
    assert failed[0]["errorCategory"] == "invalid_request"
    assert failed[0]["correlationId"] == "corr-1234567"  # observability wraps the limit
    access = json_logs.events("http.request")
    assert [entry["httpStatus"] for entry in access] == [413]


def test_an_app_that_raises_after_the_refusal_does_not_leak_the_error() -> None:
    # FastAPI turns "the client left" into a 400 that the middleware drops. A bare Starlette endpoint
    # lets `ClientDisconnect` escape instead; under uvicorn that would log a traceback even though the
    # client was answered correctly with 413.
    async def endpoint(request: Request) -> PlainTextResponse:
        await request.body()
        return PlainTextResponse("app reached")

    app = Starlette(routes=[Route("/", endpoint, methods=["POST"])])
    client = TestClient(RequestBodyLimitMiddleware(app, max_bytes=1000))

    def chunks() -> Iterator[bytes]:
        for _ in range(5):
            yield b"x" * 512

    response = client.post("/", content=chunks())  # raise_server_exceptions=True: a leak fails here
    assert response.status_code == 413 and response.json() == TOO_LARGE
    assert client.post("/", content=b"x" * 10).text == "app reached"  # normal requests unaffected
