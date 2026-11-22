"""Unit and contract tests for POST /internal/v1/ai/embed."""

from fastapi.testclient import TestClient

from conftest import FakeLlm, make_token


def test_embed_single_text_success(client: TestClient, fake_llm: FakeLlm) -> None:
    token = make_token(scope="ai:embed")
    response = client.post(
        "/internal/v1/ai/embed",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "texts": ["How to perform barbell back squat with proper form?"],
            "model": "gemini-embedding-001",
            "dimensions": 768,
            "taskType": "RETRIEVAL_DOCUMENT",
            "title": "Squat Guide",
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["model"] == "gemini-embedding-001"
    assert data["dimensions"] == 768
    assert data["count"] == 1
    assert len(data["embeddings"]) == 1
    assert len(data["embeddings"][0]) == 768


def test_embed_batch_texts_success(client: TestClient, fake_llm: FakeLlm) -> None:
    token = make_token(scope="ai:embed")
    texts = [
        "Barbell back squat instructions.",
        "Optimal protein intake for muscle hypertrophy.",
        "Post-workout hydration guidelines.",
    ]
    response = client.post(
        "/internal/v1/ai/embed",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "texts": texts,
            "taskType": "RETRIEVAL_DOCUMENT",
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["count"] == 3
    assert len(data["embeddings"]) == 3
    for emb in data["embeddings"]:
        assert len(emb) == 768


def test_embed_rejects_missing_authorization(client: TestClient) -> None:
    response = client.post(
        "/internal/v1/ai/embed",
        json={"texts": ["Sample text"]},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTH_INVALID_TOKEN"


def test_embed_rejects_wrong_scope(client: TestClient) -> None:
    token = make_token(scope="ai:coach:chat")  # not ai:embed
    response = client.post(
        "/internal/v1/ai/embed",
        headers={"Authorization": f"Bearer {token}"},
        json={"texts": ["Sample text"]},
    )
    assert response.status_code == 401


def test_embed_rejects_empty_texts(client: TestClient) -> None:
    token = make_token(scope="ai:embed")
    response = client.post(
        "/internal/v1/ai/embed",
        headers={"Authorization": f"Bearer {token}"},
        json={"texts": []},
    )
    assert response.status_code == 422


def test_embed_rejects_unknown_fields(client: TestClient) -> None:
    token = make_token(scope="ai:embed")
    response = client.post(
        "/internal/v1/ai/embed",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "texts": ["Sample text"],
            "forbiddenField": "malicious",
        },
    )
    assert response.status_code == 422
