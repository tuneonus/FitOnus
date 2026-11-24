"""Unit tests for Model Context Protocol (MCP) domain contracts and models."""

import pytest
from pydantic import ValidationError

from onusfit_ai.features.mcp.domain.contracts import (
    DEFAULT_ALLOWED_TOOLS,
    AgentApprovalStatus,
    ApprovalTicket,
    IdempotencyRecord,
    McpConfig,
    McpPromptArgument,
    McpPromptDefinition,
    McpResourceContent,
    McpResourceDefinition,
    McpToolCall,
    McpToolDefinition,
    McpToolResult,
)
from onusfit_ai.features.mcp.domain.errors import (
    McpApprovalRequiredError,
    McpConnectionError,
    McpError,
    McpPromptInjectionError,
    McpSecurityError,
    McpTimeoutError,
)
from onusfit_ai.shared.contracts.tools import (
    PersistWorkoutPlanArgs,
    PreviewNutritionPlanArgs,
    ValidateWorkoutPlanArgs,
)


def test_mcp_tool_definition_defaults_and_validation() -> None:
    tool = McpToolDefinition(
        name="get_recent_workouts",
        description="Retrieve recent workouts",
        input_schema={"type": "object", "properties": {"days": {"type": "integer"}}},
        is_write=False,
    )
    assert tool.name == "get_recent_workouts"
    assert tool.is_write is False
    assert tool.requires_auth is True

    # Extra fields forbidden
    with pytest.raises(ValidationError):
        McpToolDefinition(
            name="invalid",
            description="test",
            input_schema={},
            unknown_field=123,  # type: ignore[call-arg]
        )


def test_mcp_tool_call_validation() -> None:
    call = McpToolCall(
        tool_name="get_nutrition_summary",
        arguments={"days": 7},
        user_id="user-123",
        request_id="req-abc",
    )
    assert call.tool_name == "get_nutrition_summary"
    assert call.timeout_seconds == 5.0
    assert call.user_id == "user-123"

    # Timeout limits
    with pytest.raises(ValidationError):
        McpToolCall(
            tool_name="get_nutrition_summary",
            user_id="user-123",
            request_id="req-abc",
            timeout_seconds=0.1,  # below ge=0.5
        )


def test_mcp_tool_result_structure() -> None:
    result = McpToolResult(
        tool_name="preview_workout_plan",
        content='{"plan": "Full Body"}',
        structured_data={"plan": "Full Body"},
        execution_time_ms=45.2,
    )
    assert result.is_error is False
    assert result.execution_time_ms == 45.2
    assert result.requires_approval is False


def test_approval_ticket_lifecycle() -> None:
    ticket = ApprovalTicket(
        approval_id="ticket-001",
        tool_name="persist_workout_plan",
        arguments={"plan": {"name": "Hypertrophy A"}},
        user_id="athlete-1",
        request_id="req-999",
        summary="Create plan Hypertrophy A",
        created_at=1000.0,
        expires_at=1300.0,
    )
    assert ticket.status == AgentApprovalStatus.PENDING
    assert ticket.tool_name == "persist_workout_plan"


def test_idempotency_record() -> None:
    record = IdempotencyRecord(
        key="idemp-key-1",
        tool_name="persist_workout_plan",
        result={"plan_id": "p-100"},
        created_at=1000.0,
    )
    assert record.key == "idemp-key-1"
    assert record.result["plan_id"] == "p-100"


def test_mcp_resources_and_prompts_models() -> None:
    res = McpResourceDefinition(
        uri="fitonus://catalog/exercises",
        name="Exercise Catalog",
        description="Verified exercise database",
    )
    assert res.mime_type == "application/json"

    content = McpResourceContent(
        uri="fitonus://catalog/exercises",
        mime_type="application/json",
        text="{}",
    )
    assert content.text == "{}"

    prompt = McpPromptDefinition(
        name="workout_planning",
        description="Workout split template",
        arguments=[McpPromptArgument(name="goal", description="Target goal", required=True)],
    )
    assert len(prompt.arguments) == 1
    assert prompt.arguments[0].required is True


def test_mcp_config_defaults() -> None:
    config = McpConfig()
    assert config.enabled is True
    assert config.transport == "in_process"
    assert len(config.allowed_tools) == len(DEFAULT_ALLOWED_TOOLS)
    assert "persist_workout_plan" in config.allowed_tools
    assert "preview_nutrition_plan" in config.allowed_tools
    assert config.max_cumulative_tool_calls == 5


def test_mcp_errors_hierarchy() -> None:
    base = McpError("generic failure")
    assert base.code == "MCP_ERROR"

    conn = McpConnectionError("connection dropped")
    assert conn.code == "MCP_CONNECTION_ERROR"
    assert isinstance(conn, McpError)

    timeout = McpTimeoutError("search_exercises", 5.0)
    assert timeout.code == "MCP_TIMEOUT_ERROR"
    assert timeout.operation == "search_exercises"

    sec = McpSecurityError("Unauthorized access")
    assert sec.code == "MCP_SECURITY_ERROR"

    injection = McpPromptInjectionError("ignore previous instructions")
    assert injection.code == "MCP_PROMPT_INJECTION_DETECTED"
    assert isinstance(injection, McpSecurityError)

    approval = McpApprovalRequiredError("persist_workout_plan", "appr-1", "Needs confirm")
    assert approval.code == "MCP_APPROVAL_REQUIRED"


def test_new_tool_arg_schemas() -> None:
    # 1. ValidateWorkoutPlanArgs
    val = ValidateWorkoutPlanArgs(plan={"sessions": []}, experience_level="beginner")
    assert val.experience_level == "beginner"

    # 2. PersistWorkoutPlanArgs
    save = PersistWorkoutPlanArgs(plan={"sessions": []}, name="Hypertrophy 4-Day")
    assert save.confirmed is False
    assert save.name == "Hypertrophy 4-Day"

    # 3. PreviewNutritionPlanArgs
    nut = PreviewNutritionPlanArgs(goal="fat_loss", weight_kg=80.0)
    assert nut.goal == "fat_loss"
    assert nut.weight_kg == 80.0
