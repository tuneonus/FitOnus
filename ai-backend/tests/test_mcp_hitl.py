"""Unit tests for Human-in-the-Loop (HITL) approval state machine and idempotency."""

import time

import pytest

from onusfit_ai.features.mcp.application.orchestrator import (
    AgentToolOrchestrator,
    ApprovalManager,
    IdempotencyManager,
)
from onusfit_ai.features.mcp.application.registry import create_fitonus_tool_registry
from onusfit_ai.features.mcp.domain.contracts import (
    AgentApprovalStatus,
    McpToolCall,
)
from onusfit_ai.features.mcp.domain.errors import McpError, McpSecurityError


@pytest.mark.asyncio
async def test_hitl_write_operation_triggers_approval_requirement() -> None:
    registry = create_fitonus_tool_registry()
    approval_mgr = ApprovalManager()
    orchestrator = AgentToolOrchestrator(registry=registry, approval_manager=approval_mgr)

    # Initial unconfirmed write call
    call = McpToolCall(
        tool_name="persist_workout_plan",
        arguments={
            "plan": {"sessions": [{"day_name": "Monday"}]},
            "name": "Hypertrophy Block",
            "confirmed": False,
        },
        user_id="user-hitl-1",
        request_id="req-hitl-1",
    )

    result = await orchestrator.execute_tool(call)
    assert result.is_error is False
    assert result.requires_approval is True
    assert result.approval_ticket is not None
    assert result.approval_ticket.status == AgentApprovalStatus.PENDING
    assert result.approval_ticket.user_id == "user-hitl-1"

    assert result.approval_ticket.approval_id != ""
    assert "ACTION REQUIRED" in result.content


@pytest.mark.asyncio
async def test_hitl_user_confirmation_executes_write_operation() -> None:
    registry = create_fitonus_tool_registry()
    approval_mgr = ApprovalManager()
    orchestrator = AgentToolOrchestrator(registry=registry, approval_manager=approval_mgr)

    # 1. Trigger unconfirmed write
    unconfirmed = await orchestrator.execute_tool(
        McpToolCall(
            tool_name="persist_workout_plan",
            arguments={"plan": {"sessions": []}, "name": "Strength Split"},
            user_id="user-hitl-2",
            request_id="req-hitl-2",
        )
    )
    assert unconfirmed.requires_approval is True
    ticket_id = unconfirmed.approval_ticket.approval_id

    # 2. Confirm and execute
    confirmed = await orchestrator.confirm_and_execute(
        approval_id=ticket_id,
        user_id="user-hitl-2",
        request_id="req-confirm-2",
    )
    assert confirmed.is_error is False
    assert confirmed.requires_approval is False
    assert confirmed.structured_data["success"] is True
    assert confirmed.structured_data["name"] == "Strength Split"
    assert "plan_id" in confirmed.structured_data


@pytest.mark.asyncio
async def test_hitl_cross_user_approval_is_forbidden() -> None:
    registry = create_fitonus_tool_registry()
    approval_mgr = ApprovalManager()
    orchestrator = AgentToolOrchestrator(registry=registry, approval_manager=approval_mgr)

    # User 1 initiates action
    unconfirmed = await orchestrator.execute_tool(
        McpToolCall(
            tool_name="persist_workout_plan",
            arguments={"plan": {}, "name": "Victim Plan"},
            user_id="legitimate-user",
            request_id="req-orig",
        )
    )
    ticket_id = unconfirmed.approval_ticket.approval_id

    # Attacker User tries to approve legitimate user's ticket
    with pytest.raises(McpSecurityError) as exc_info:
        await orchestrator.confirm_and_execute(
            approval_id=ticket_id,
            user_id="attacker-user",
            request_id="req-attack",
        )
    assert "Unauthorized" in str(exc_info.value)


@pytest.mark.asyncio
async def test_hitl_expired_ticket_rejected() -> None:
    approval_mgr = ApprovalManager(default_ttl_seconds=0.01)
    ticket = approval_mgr.create_ticket(
        tool_name="persist_workout_plan",
        arguments={},
        user_id="user-1",
        request_id="r1",
        summary="Expired test",
    )
    time.sleep(0.02)  # Wait for expiration

    with pytest.raises(McpError) as exc_info:
        approval_mgr.approve_ticket(ticket.approval_id, user_id="user-1")
    assert "expired" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_idempotency_prevents_duplicate_mutations() -> None:
    registry = create_fitonus_tool_registry()
    idempotency_mgr = IdempotencyManager()
    orchestrator = AgentToolOrchestrator(registry=registry, idempotency_manager=idempotency_mgr)

    # First write with idempotency key
    call1 = McpToolCall(
        tool_name="persist_workout_plan",
        arguments={
            "plan": {"sessions": []},
            "name": "Repeat Split",
            "confirmed": True,
            "idempotency_key": "idemp-unique-999",
        },
        user_id="user-idemp",
        request_id="req-idemp-1",
    )

    res1 = await orchestrator.execute_tool(call1)
    assert res1.is_error is False
    plan_id_1 = res1.structured_data["plan_id"]

    # Replay same call with identical idempotency key
    call2 = McpToolCall(
        tool_name="persist_workout_plan",
        arguments={
            "plan": {"sessions": []},
            "name": "Repeat Split",
            "confirmed": True,
            "idempotency_key": "idemp-unique-999",
        },
        user_id="user-idemp",
        request_id="req-idemp-2",
    )

    res2 = await orchestrator.execute_tool(call2)
    assert res2.is_error is False
    plan_id_2 = res2.structured_data["plan_id"]

    # Must return identical cached result without creating new record
    assert plan_id_1 == plan_id_2
