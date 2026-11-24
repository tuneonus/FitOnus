"""Integration tests for FastAPI Workout Planner endpoints."""

from fastapi.testclient import TestClient

from conftest import FakeLlm, make_token

GEN_URL = "/internal/v1/ai/workout-planner/generate"
ADAPT_URL = "/internal/v1/ai/workout-planner/adapt"
VALIDATE_URL = "/internal/v1/ai/workout-planner/validate"


def auth_headers(sub: str = "11111111-1111-1111-1111-111111111111") -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(scope='ai:workout:plan', sub=sub)}"}


def test_api_generate_workout_plan(client: TestClient, fake_llm: FakeLlm) -> None:
    payload = {
        "user_id": "11111111-1111-1111-1111-111111111111",
        "goal": "general_fitness",
        "experience_level": "intermediate",
        "available_equipment": ["dumbbells", "bodyweight"],
        "days_per_week": 3,
        "session_duration_minutes": 45,
        "environment": "home",
        "physical_limitations": [],
    }
    response = client.post(
        GEN_URL,
        json=payload,
        headers=auth_headers() | {"X-Request-Id": "req-gen-1"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "plan" in data
    assert "validation" in data
    assert data["validation"]["is_valid"] is True
    assert len(data["plan"]["schedule_days"]) == 3
    assert data["trace_id"] == "req-gen-1"


def test_api_adapt_workout_plan(client: TestClient, fake_llm: FakeLlm) -> None:
    # First generate a baseline plan
    gen_payload = {
        "user_id": "11111111-1111-1111-1111-111111111111",
        "goal": "muscle_building",
        "experience_level": "intermediate",
        "available_equipment": ["dumbbells", "bench", "bodyweight"],
        "days_per_week": 3,
        "session_duration_minutes": 60,
    }
    gen_res = client.post(GEN_URL, json=gen_payload, headers=auth_headers())
    assert gen_res.status_code == 200
    current_plan = gen_res.json()["plan"]

    # Now adapt it with reduced duration
    adapt_payload = {
        "user_id": "11111111-1111-1111-1111-111111111111",
        "current_plan": current_plan,
        "reduced_duration_minutes": 30,
        "difficulty_feedback": "too_hard",
    }
    adapt_res = client.post(
        ADAPT_URL,
        json=adapt_payload,
        headers=auth_headers() | {"X-Request-Id": "req-adapt-1"},
    )
    assert adapt_res.status_code == 200
    adapted_data = adapt_res.json()
    assert "plan" in adapted_data
    assert adapted_data["validation"]["is_valid"] is True
    assert adapted_data["trace_id"] == "req-adapt-1"


def test_api_validate_workout_plan(client: TestClient, fake_llm: FakeLlm) -> None:
    gen_payload = {
        "user_id": "11111111-1111-1111-1111-111111111111",
        "goal": "general_fitness",
        "experience_level": "beginner",
        "available_equipment": ["bodyweight"],
        "days_per_week": 2,
        "session_duration_minutes": 30,
    }
    gen_res = client.post(GEN_URL, json=gen_payload, headers=auth_headers())
    current_plan = gen_res.json()["plan"]

    val_payload = {
        "plan": current_plan,
        "request": gen_payload,
    }
    val_res = client.post(
        VALIDATE_URL,
        json=val_payload,
        headers=auth_headers(),
    )
    assert val_res.status_code == 200
    val_data = val_res.json()
    assert val_data["is_valid"] is True


def test_api_requires_scope_auth(client: TestClient) -> None:
    # No auth header -> 401
    res = client.post(GEN_URL, json={"user_id": "usr_none"})
    assert res.status_code == 401

    # Wrong scope -> 401
    bad_scope_headers = {"Authorization": f"Bearer {make_token(scope='ai:meal:photo')}"}
    res_bad = client.post(GEN_URL, json={"user_id": "usr_bad"}, headers=bad_scope_headers)
    assert res_bad.status_code == 401
