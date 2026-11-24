"""Integration tests for FastAPI MCP endpoints."""

from fastapi.testclient import TestClient

from conftest import make_token

MCP_BASE = "/internal/v1/mcp"
USER_ID = "11111111-1111-1111-1111-111111111111"


def mcp_auth_headers(sub: str = USER_ID, scope: str = "ai:tools:read") -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(scope=scope, sub=sub)}"}


def test_mcp_status_endpoint(client: TestClient) -> None:
    # 1. Unauthenticated fails with 401
    unauth = client.get(f"{MCP_BASE}/status")
    assert unauth.status_code == 401

    # 2. Authenticated succeeds
    response = client.get(f"{MCP_BASE}/status", headers=mcp_auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert "server" in data
    assert "version" in data


def test_mcp_list_tools_endpoint(client: TestClient) -> None:
    response = client.get(f"{MCP_BASE}/tools", headers=mcp_auth_headers())
    assert response.status_code == 200
    tools = response.json()
    assert len(tools) >= 10
    names = {t["name"] for t in tools}
    assert "get_fitness_profile" in names
    assert "preview_workout_plan" in names
    assert "persist_workout_plan" in names


def test_mcp_execute_tool_success_and_isolation(client: TestClient) -> None:
    payload = {
        "tool_name": "preview_nutrition_plan",
        "arguments": {"goal": "fat_loss", "weight_kg": 75.0},
        "user_id": USER_ID,
        "request_id": "req-api-1",
        "timeout_seconds": 5.0,
    }

    # 1. Legitimate user execution succeeds
    response = client.post(
        f"{MCP_BASE}/tools/execute",
        json=payload,
        headers=mcp_auth_headers(sub=USER_ID),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["is_error"] is False
    assert data["structured_data"]["nutrition_plan"]["goal"] == "fat_loss"

    # 2. Cross-user deputy execution is forbidden (HTTP 403)
    attacker_payload = dict(payload)
    attacker_payload["user_id"] = "victim-user-999"

    cross_user = client.post(
        f"{MCP_BASE}/tools/execute",
        json=attacker_payload,
        headers=mcp_auth_headers(sub=USER_ID),
    )
    assert cross_user.status_code == 403
    assert "Forbidden" in cross_user.json()["detail"]


def test_mcp_resources_endpoints(client: TestClient) -> None:
    # List resources
    list_res = client.get(f"{MCP_BASE}/resources", headers=mcp_auth_headers())
    assert list_res.status_code == 200
    resources = list_res.json()
    assert len(resources) == 3

    # Read resource
    read_res = client.post(
        f"{MCP_BASE}/resources/read",
        json={"uri": "fitonus://planning/guidelines"},
        headers=mcp_auth_headers(),
    )
    assert read_res.status_code == 200
    assert "weekly_frequency_limits" in read_res.json()["text"]


def test_mcp_prompts_endpoints(client: TestClient) -> None:
    # List prompts
    list_p = client.get(f"{MCP_BASE}/prompts", headers=mcp_auth_headers())
    assert list_p.status_code == 200
    prompts = list_p.json()
    assert len(prompts) >= 2

    # Get prompt
    get_p = client.post(
        f"{MCP_BASE}/prompts/get",
        json={"name": "workout_planning", "arguments": {"target_goal": "strength"}},
        headers=mcp_auth_headers(),
    )
    assert get_p.status_code == 200
    assert "strength" in get_p.json()["messages"][0]["content"]


def test_mcp_hitl_approval_confirmation_flow(client: TestClient) -> None:
    # 1. Unconfirmed write creates approval ticket
    write_payload = {
        "tool_name": "persist_workout_plan",
        "arguments": {"plan": {"sessions": []}, "name": "API Confirmed Plan"},
        "user_id": USER_ID,
        "request_id": "req-api-write",
    }
    unconfirmed = client.post(
        f"{MCP_BASE}/tools/execute",
        json=write_payload,
        headers=mcp_auth_headers(sub=USER_ID),
    )
    assert unconfirmed.status_code == 200
    unconf_data = unconfirmed.json()
    assert unconf_data["requires_approval"] is True
    ticket_id = unconf_data["approval_ticket"]["approval_id"]

    # 2. Confirm approval via POST /internal/v1/mcp/approval/confirm
    confirm_res = client.post(
        f"{MCP_BASE}/approval/confirm",
        json={"approval_id": ticket_id},
        headers=mcp_auth_headers(sub=USER_ID),
    )
    assert confirm_res.status_code == 200
    data = confirm_res.json()
    assert data["is_error"] is False
    assert data["structured_data"]["success"] is True
    assert data["structured_data"]["name"] == "API Confirmed Plan"
